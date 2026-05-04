import json
import math
import re
from datetime import date, datetime, timedelta
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from pydantic import BaseModel
from sqlmodel import Session, delete, select

from app.config import settings
from app.db import get_session
from app.deps import get_current_email
from app.models import (
    AssessmentSubmission,
    StudyPlan,
    StudyPlanItem,
    Syllabus,
    SyllabusPlaylist,
    TopicPerformance,
    VideoAssessment,
)

router = APIRouter()


class GenerateStudyPlanIn(BaseModel):
    end_date: str
    hours_per_day: float
    force_regenerate: bool = False


def extract_topics(raw_text: str) -> List[str]:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    topics = []
    for line in lines:
        lower = line.lower()
        if (
            "unit" in lower
            or "module" in lower
            or "topic" in lower
            or "chapter" in lower
        ):
            topics.append(line)

    if not topics:
        topics = lines[:15]

    return topics[:20]


def get_ai_client():
    if OpenAI is None:
        raise HTTPException(
            status_code=500,
            detail="OpenAI library not installed. Install it with: pip install openai",
        )

    if settings.openai_api_key:
        return OpenAI(api_key=settings.openai_api_key), "gpt-4o-mini"

    if settings.groq_api_key:
        return (
            OpenAI(
                api_key=settings.groq_api_key,
                base_url="https://api.groq.com/openai/v1",
            ),
            settings.groq_model,
        )

    raise HTTPException(
        status_code=500,
        detail="No AI API key found. Set OPENAI_API_KEY or GROQ_API_KEY in .env",
    )


def parse_youtube_duration(duration: str | None) -> int:
    if not duration:
        return 10

    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return 10

    hours   = int(match.group(1)) if match.group(1) else 0
    minutes = int(match.group(2)) if match.group(2) else 0
    seconds = int(match.group(3)) if match.group(3) else 0

    total_minutes = hours * 60 + minutes + math.ceil(seconds / 60)
    return total_minutes if total_minutes > 0 else 10


async def fetch_video_durations(video_ids: list[str]) -> dict[str, str]:
    if not video_ids:
        return {}

    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not set in .env")

    url    = "https://www.googleapis.com/youtube/v3/videos"
    chunks = [video_ids[i:i + 50] for i in range(0, len(video_ids), 50)]
    duration_map: dict[str, str] = {}

    async with httpx.AsyncClient(timeout=20) as client:
        for chunk in chunks:
            params = {
                "part": "contentDetails",
                "id":   ",".join(chunk),
                "key":  settings.youtube_api_key,
            }

            r = await client.get(url, params=params)
            if r.status_code != 200:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise HTTPException(status_code=502, detail=f"YouTube videos API error: {detail}")

            js = r.json()
            for item in js.get("items", []):
                vid      = item.get("id")
                duration = item.get("contentDetails", {}).get("duration")
                if vid:
                    duration_map[vid] = duration or "PT10M"

    return duration_map


async def fetch_playlist_videos(playlist_id: str) -> list[dict]:
    """Fetch all videos from a single playlist."""
    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not set in .env")

    url             = "https://www.googleapis.com/youtube/v3/playlistItems"
    raw_videos      = []
    next_page_token = None

    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            params = {
                "part":       "snippet,contentDetails",
                "playlistId": playlist_id,
                "maxResults": 50,
                "key":        settings.youtube_api_key,
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            r = await client.get(url, params=params)

            if r.status_code != 200:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise HTTPException(status_code=502, detail=f"YouTube API error: {detail}")

            js = r.json()

            for it in js.get("items", []):
                snippet  = it.get("snippet", {})
                resource = snippet.get("resourceId", {})
                video_id = resource.get("videoId")

                if not video_id:
                    continue

                raw_videos.append(
                    {
                        "video_id":    video_id,
                        "video_title": snippet.get("title", "Untitled Video"),
                        "position":    snippet.get("position", 0),
                        "video_url":   f"https://www.youtube.com/watch?v={video_id}&list={playlist_id}",
                        "channel":     snippet.get("videoOwnerChannelTitle") or snippet.get("channelTitle"),
                        "playlist_id": playlist_id,
                    }
                )

            next_page_token = js.get("nextPageToken")
            if not next_page_token:
                break

    raw_videos.sort(key=lambda x: (x["position"] is None, x["position"]))

    duration_map = await fetch_video_durations([v["video_id"] for v in raw_videos])

    videos = []
    for video in raw_videos:
        video["duration"] = duration_map.get(video["video_id"], "PT10M")
        videos.append(video)

    return videos


async def fetch_all_playlists_videos(playlist_ids: list[str]) -> list[dict]:
    """
    Fetch videos from ALL playlists and merge them in order.
    Videos from playlist 1 come first, then playlist 2, etc.
    Duplicate video_ids across playlists are removed (first occurrence kept).
    """
    all_videos      = []
    seen_video_ids  = set()

    for playlist_id in playlist_ids:
        videos = await fetch_playlist_videos(playlist_id)
        for video in videos:
            if video["video_id"] not in seen_video_ids:
                all_videos.append(video)
                seen_video_ids.add(video["video_id"])

    return all_videos


# ---------------------------------------------------------------------------
# Fallback plan — video-duration-based, hard-capped to available_days
# ---------------------------------------------------------------------------

def build_video_based_fallback_plan(
    topics: list[str],
    videos: list[dict],
    today: date,
    end_date_obj: date,
    hours_per_day: float,
) -> tuple[str, list[dict], bool]:          # ← now returns (summary, plan, is_compressed)
    available_days = (end_date_obj - today).days
    if available_days <= 0:
        available_days = 1

    if not videos:
        raise HTTPException(status_code=400, detail="No videos found in selected playlists")

    topics_to_use           = topics if topics else ["General Study"]
    daily_minutes_limit     = max(1, int(hours_per_day * 60))
    extra_buffer_per_video  = 10

    current_date       = today + timedelta(days=1)
    current_day        = 1
    minutes_used_today = 0
    topic_index        = 0
    plan               = []
    videos_dropped     = 0

    for video in videos:
        # ── Hard stop: never exceed available_days ──────────────────────────
        if current_day > available_days:
            videos_dropped += 1
            continue

        video_minutes           = parse_youtube_duration(video.get("duration"))
        total_minutes_for_video = video_minutes + extra_buffer_per_video

        if minutes_used_today + total_minutes_for_video > daily_minutes_limit:
            # Would overflow today — try moving to the next day
            if current_day + 1 > available_days:
                # Next day is already out of range — skip this video
                videos_dropped += 1
                continue
            current_day        += 1
            current_date       += timedelta(days=1)
            minutes_used_today  = 0

        topic = topics_to_use[topic_index % len(topics_to_use)]

        plan.append(
            {
                "day":             current_day,
                "date":            current_date.isoformat(),
                "topic":           topic,
                "task":            f"Watch and study: {video['video_title']} + 10 mins revision/assessment time",
                "priority":        "high",
                "estimated_hours": round(total_minutes_for_video / 60, 2),
                "video_id":        video["video_id"],
                "video_title":     video["video_title"],
                "video_url":       video["video_url"],
            }
        )

        minutes_used_today += total_minutes_for_video
        topic_index        += 1

    # ── Fill remaining days with revision (strictly within available_days) ──
    last_day  = plan[-1]["day"]  if plan else 0
    last_date = (
        datetime.strptime(plan[-1]["date"], "%Y-%m-%d").date()
        if plan else today
    )

    remaining_days = available_days - last_day
    for i in range(remaining_days):
        last_day  += 1
        last_date += timedelta(days=1)

        if last_day > available_days:           # safety guard
            break

        topic = topics_to_use[i % len(topics_to_use)]
        plan.append(
            {
                "day":             last_day,
                "date":            last_date.isoformat(),
                "topic":           topic,
                "task":            f"Revision and practice for weak areas in: {topic}",
                "priority":        "medium",
                "estimated_hours": hours_per_day,
                "video_id":        None,
                "video_title":     None,
                "video_url":       None,
            }
        )

    is_compressed = videos_dropped > 0

    summary = (
        "Study plan generated using playlist video durations across all selected playlists, "
        "with an extra 10 minutes after each video for revision and assessment. "
        "Remaining days are reserved for revision of weak topics."
    )
    if is_compressed:
        summary += (
            f" Note: {videos_dropped} video(s) could not fit within your "
            f"{available_days}-day limit and were excluded."
        )

    return summary, plan, is_compressed


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def serialize_study_plan(
    plan: StudyPlan,
    items: list[StudyPlanItem],
    playlists: list[SyllabusPlaylist] | None = None,
    warning: str | None = None,
):
    items = sorted(items, key=lambda x: (x.day_number, x.plan_date, x.id))

    playlist_list = []
    if playlists:
        playlist_list = [
            {
                "playlist_id":  p.playlist_id,
                "playlist_url": p.playlist_url,
            }
            for p in playlists
        ]

    result = {
        "study_plan_id": plan.id,
        "syllabus_id":   plan.syllabus_id,
        "title":         plan.title,
        "summary":       plan.summary,
        "end_date":      plan.end_date.isoformat(),
        "hours_per_day": plan.hours_per_day,
        # backward-compatible single playlist fields
        "playlist_id":   playlists[0].playlist_id  if playlists else None,
        "playlist_url":  playlists[0].playlist_url if playlists else None,
        # full list of all playlists
        "playlists":     playlist_list,
        "plan": [
            {
                "id":              item.id,
                "day":             item.day_number,
                "date":            item.plan_date.isoformat(),
                "topic":           item.topic,
                "task":            item.task,
                "priority":        item.priority,
                "estimated_hours": item.estimated_hours,
                "is_completed":    item.is_completed,
                "video_id":        item.video_id,
                "video_title":     item.video_title,
                "video_url":       item.video_url,
            }
            for item in items
        ],
    }

    # ── Attach compression warning if present ──────────────────────────────
    if warning:
        result["warning"] = warning

    return result


def get_mastery_level(mastery_percentage: float) -> str:
    if mastery_percentage >= 80:
        return "strong"
    elif mastery_percentage >= 50:
        return "medium"
    return "weak"


def get_next_plan_slot(existing_items: list[StudyPlanItem], start_date: date) -> tuple[int, date]:
    if not existing_items:
        return 1, start_date

    existing_sorted = sorted(existing_items, key=lambda x: (x.plan_date, x.day_number, x.id or 0))
    last_item = existing_sorted[-1]

    next_date = max(start_date, last_item.plan_date + timedelta(days=1))
    next_day  = last_item.day_number + 1

    return next_day, next_date


# ---------------------------------------------------------------------------
# POST /generate/{syllabus_id}
# ---------------------------------------------------------------------------

@router.post("/generate/{syllabus_id}")
async def generate_study_plan(
    syllabus_id: int,
    data: GenerateStudyPlanIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    # Fetch ALL playlists for this syllabus
    saved_playlists = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).all()

    if not saved_playlists:
        raise HTTPException(
            status_code=400,
            detail="No playlist selected for this syllabus. Please select at least one playlist first.",
        )

    existing_plan = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        )
    ).first()

    if existing_plan and not data.force_regenerate:
        existing_items = session.exec(
            select(StudyPlanItem).where(StudyPlanItem.study_plan_id == existing_plan.id)
        ).all()
        return serialize_study_plan(existing_plan, existing_items, saved_playlists)

    try:
        end_date_obj = datetime.strptime(data.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="end_date must be in YYYY-MM-DD format",
        )

    today = date.today()
    if end_date_obj <= today:
        raise HTTPException(status_code=400, detail="End date must be after today")

    if data.hours_per_day <= 0 or data.hours_per_day > 16:
        raise HTTPException(
            status_code=400,
            detail="hours_per_day must be between 0 and 16",
        )

    available_days = (end_date_obj - today).days
    topics = extract_topics(syllabus.raw_text or "")

    if not topics:
        raise HTTPException(status_code=400, detail="No topics found in syllabus")

    # Fetch videos from ALL playlists merged in order
    playlist_ids    = [p.playlist_id for p in saved_playlists]
    playlist_videos = await fetch_all_playlists_videos(playlist_ids)

    if not playlist_videos:
        raise HTTPException(
            status_code=400,
            detail="No videos found in any of the selected playlists.",
        )

    perf_rows = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
        )
    ).all()

    weak_topics    = []
    average_topics = []
    strong_topics  = []

    for row in perf_rows:
        mastery    = getattr(row, "mastery_percentage", 0.0) or 0.0
        topic_name = getattr(row, "topic_name", "")
        if not topic_name:
            continue

        if mastery < 60:
            weak_topics.append(topic_name)
        elif mastery >= 80:
            strong_topics.append(topic_name)
        else:
            average_topics.append(topic_name)

    videos_for_prompt = [
        {
            "video_id":         v["video_id"],
            "video_title":      v["video_title"],
            "video_url":        v["video_url"],
            "position":         v["position"],
            "playlist_id":      v.get("playlist_id"),
            "duration":         v.get("duration", "PT10M"),
            "duration_minutes": parse_youtube_duration(v.get("duration")),
        }
        for v in playlist_videos[:60]
    ]

    client, model_name = get_ai_client()

    # Strict date boundaries for the AI
    plan_start_date = (today + timedelta(days=1)).isoformat()
    plan_end_date   = end_date_obj.isoformat()

    # Build outside f-string to avoid dict-inside-f-string escaping issues
    playlists_for_prompt = [
        {"playlist_id": p.playlist_id, "playlist_url": p.playlist_url}
        for p in saved_playlists
    ]

    prompt = f"""
You are an expert academic planner.

Create a practical day-wise study plan in VALID JSON ONLY.

Student details:
- syllabus title: {syllabus.title}
- today: {today.isoformat()}
- end date: {plan_end_date}
- days available: {available_days}
- study hours per day: {data.hours_per_day}
- daily study minutes target: {int(data.hours_per_day * 60)}

Syllabus topics:
{json.dumps(topics, indent=2)}

Weak topics (prioritise these):
{json.dumps(weak_topics, indent=2)}

Average topics:
{json.dumps(average_topics, indent=2)}

Strong topics:
{json.dumps(strong_topics, indent=2)}

Selected playlists ({len(saved_playlists)} total):
{json.dumps(playlists_for_prompt, indent=2)}

Playlist videos (merged from all playlists in order):
{json.dumps(videos_for_prompt, indent=2)}

Rules:
1. Use the given playlist videos in order.
2. Consider video durations — fit multiple short videos in one day if hours allow.
3. A single day can contain multiple videos; use multiple rows with the same day number and date.
4. STRICT: day numbers must be between 1 and {available_days} ONLY. Never use a day number above {available_days}.
5. STRICT: all dates must be between {plan_start_date} and {plan_end_date} ONLY. Never use a date outside this range.
6. If not all videos fit, prioritise weak topics first, then average, then strong. Drop remaining videos.
7. Return ONLY valid JSON — no markdown, no explanation, no extra text.
8. JSON format must be exactly:
{{
  "summary": "short summary",
  "plan": [
    {{
      "day": 1,
      "date": "YYYY-MM-DD",
      "topic": "topic name",
      "task": "what to do",
      "priority": "high",
      "estimated_hours": 0.75,
      "video_id": "abc123",
      "video_title": "video title",
      "video_url": "https://youtube..."
    }}
  ]
}}
"""

    summary      = ""
    plan_items   = []
    is_compressed = False

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role":    "system",
                    "content": "You create structured study plans in strict JSON. Never exceed the day or date limits provided.",
                },
                {
                    "role":    "user",
                    "content": prompt,
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()

        if content.startswith("```json"):
            content = content[len("```json"):].strip()
        elif content.startswith("```"):
            content = content[len("```"):].strip()

        if content.endswith("```"):
            content = content[:-3].strip()

        parsed     = json.loads(content)
        summary    = parsed.get("summary", "")
        plan_items = parsed.get("plan", [])

        if (
            not isinstance(plan_items, list)
            or len(plan_items) == 0
            or len(plan_items) < max(1, min(len(playlist_videos) // 2, len(playlist_videos) - 1))
        ):
            raise ValueError("AI returned incomplete plan")

        # ── Post-parse clamp: drop / fix any items outside the allowed range ─
        clamped_items  = []
        dropped_count  = 0

        for item in plan_items:
            try:
                item_date = datetime.strptime(item.get("date", ""), "%Y-%m-%d").date()
            except Exception:
                item_date = today + timedelta(days=1)

            # Drop items beyond the end date
            if item_date > end_date_obj:
                dropped_count += 1
                continue

            # Clamp date to valid range
            item_date      = max(today + timedelta(days=1), min(item_date, end_date_obj))
            item["date"]   = item_date.isoformat()

            # Clamp day number
            item["day"]    = max(1, min(int(item.get("day", 1)), available_days))

            clamped_items.append(item)

        if dropped_count > 0:
            is_compressed = True
            summary += (
                f" Note: {dropped_count} item(s) were removed because they exceeded "
                f"your {available_days}-day study limit."
            )

        plan_items = clamped_items

    except Exception as e:
        print("AI study plan generation failed or was incomplete, using fallback plan:", str(e))
        summary, plan_items, is_compressed = build_video_based_fallback_plan(
            topics=topics,
            videos=playlist_videos,
            today=today,
            end_date_obj=end_date_obj,
            hours_per_day=data.hours_per_day,
        )

    # ── Persist plan ────────────────────────────────────────────────────────
    if existing_plan and data.force_regenerate:
        session.exec(
            delete(StudyPlanItem).where(StudyPlanItem.study_plan_id == existing_plan.id)
        )
        session.delete(existing_plan)
        session.commit()

    saved_plan = StudyPlan(
        user_email=email,
        syllabus_id=syllabus_id,
        title=syllabus.title,
        summary=summary,
        end_date=end_date_obj,
        hours_per_day=data.hours_per_day,
    )
    session.add(saved_plan)
    session.commit()
    session.refresh(saved_plan)

    saved_items = []

    for item in plan_items:
        item_date_raw = item.get("date")
        try:
            item_date = datetime.strptime(item_date_raw, "%Y-%m-%d").date()
        except Exception:
            item_date = today + timedelta(days=1)

        saved_item = StudyPlanItem(
            study_plan_id  = saved_plan.id,
            day_number     = int(item.get("day", 1)),
            plan_date      = item_date,
            topic          = str(item.get("topic", "")),
            task           = str(item.get("task", "")),
            priority       = str(item.get("priority", "medium")).lower(),
            estimated_hours= float(item.get("estimated_hours", 1)),
            is_completed   = False,
            video_id       = item.get("video_id"),
            video_title    = item.get("video_title"),
            video_url      = item.get("video_url"),
        )
        session.add(saved_item)
        saved_items.append(saved_item)

    if not saved_items:
        raise HTTPException(status_code=500, detail="Failed to save study plan items")

    session.commit()

    for item in saved_items:
        session.refresh(item)

    # ── Build warning string for the frontend ───────────────────────────────
    warning_msg = (
        "Some videos were excluded because they couldn't fit within your study timeline. "
        "Consider extending your end date or increasing your daily study hours for full coverage."
    ) if is_compressed else None

    return serialize_study_plan(saved_plan, saved_items, saved_playlists, warning=warning_msg)


# ---------------------------------------------------------------------------
# POST /adapt/{syllabus_id}
# ---------------------------------------------------------------------------

@router.post("/adapt/{syllabus_id}")
def adapt_study_plan(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    saved_plan = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        )
    ).first()

    if not saved_plan:
        raise HTTPException(status_code=404, detail="No saved study plan found")

    playlists = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).all()

    plan_items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.study_plan_id == saved_plan.id)
    ).all()

    if not plan_items:
        raise HTTPException(status_code=404, detail="No study plan items found")

    performances = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
        )
    ).all()

    perf_map = {p.topic_name.strip().lower(): p for p in performances if p.topic_name}

    existing_revision_keys = {
        (
            (item.topic or "").strip().lower(),
            (item.task  or "").strip().lower(),
        )
        for item in plan_items
        if not item.is_completed
    }

    changes   = []
    new_items = []

    base_date = date.today() + timedelta(days=1)
    next_day, next_date = get_next_plan_slot(plan_items, base_date)

    for item in sorted(plan_items, key=lambda x: (x.day_number, x.plan_date, x.id or 0)):
        if item.is_completed:
            continue

        topic_key = (item.topic or "").strip().lower()
        if not topic_key:
            continue

        perf = perf_map.get(topic_key)
        if not perf:
            continue

        mastery_level = perf.mastery_level or get_mastery_level(perf.mastery_percentage)

        if mastery_level == "medium":
            revision_key = (topic_key, "revision")
            if revision_key not in existing_revision_keys:
                revision_item = StudyPlanItem(
                    study_plan_id  = saved_plan.id,
                    day_number     = next_day,
                    plan_date      = next_date,
                    topic          = item.topic,
                    task           = "Revision",
                    priority       = "medium",
                    estimated_hours= 1.0,
                    is_completed   = False,
                )
                new_items.append(revision_item)
                existing_revision_keys.add(revision_key)

                changes.append(
                    {
                        "topic":              item.topic,
                        "mastery_percentage": round(perf.mastery_percentage, 2),
                        "mastery_level":      mastery_level,
                        "action":             "Added revision task",
                    }
                )

                next_day  += 1
                next_date += timedelta(days=1)

        elif mastery_level == "weak":
            revision_key = (topic_key, "revision")
            quiz_key     = (topic_key, "practice quiz")

            if revision_key not in existing_revision_keys:
                revision_item = StudyPlanItem(
                    study_plan_id  = saved_plan.id,
                    day_number     = next_day,
                    plan_date      = next_date,
                    topic          = item.topic,
                    task           = "Revision",
                    priority       = "high",
                    estimated_hours= 1.5,
                    is_completed   = False,
                )
                new_items.append(revision_item)
                existing_revision_keys.add(revision_key)

                changes.append(
                    {
                        "topic":              item.topic,
                        "mastery_percentage": round(perf.mastery_percentage, 2),
                        "mastery_level":      mastery_level,
                        "action":             "Added revision task",
                    }
                )

                next_day  += 1
                next_date += timedelta(days=1)

            if quiz_key not in existing_revision_keys:
                practice_item = StudyPlanItem(
                    study_plan_id  = saved_plan.id,
                    day_number     = next_day,
                    plan_date      = next_date,
                    topic          = item.topic,
                    task           = "Practice Quiz",
                    priority       = "high",
                    estimated_hours= 1.0,
                    is_completed   = False,
                )
                new_items.append(practice_item)
                existing_revision_keys.add(quiz_key)

                changes.append(
                    {
                        "topic":              item.topic,
                        "mastery_percentage": round(perf.mastery_percentage, 2),
                        "mastery_level":      mastery_level,
                        "action":             "Added practice quiz",
                    }
                )

                next_day  += 1
                next_date += timedelta(days=1)

            perf.revision_count = (perf.revision_count or 0) + 1
            perf.needs_revision = True
            session.add(perf)

    for item in new_items:
        session.add(item)

    if new_items:
        session.commit()

    updated_items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.study_plan_id == saved_plan.id)
    ).all()

    return {
        "message":     "Study plan adapted successfully",
        "added_items": len(new_items),
        "changes":     changes,
        **serialize_study_plan(saved_plan, updated_items, playlists),
    }


# ---------------------------------------------------------------------------
# GET /course-flow/{syllabus_id}
# ---------------------------------------------------------------------------

@router.get("/course-flow/{syllabus_id}")
def get_course_flow(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    plan = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        )
    ).first()

    if not plan:
        raise HTTPException(status_code=404, detail="No saved study plan found")

    playlists = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).all()

    items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.study_plan_id == plan.id)
    ).all()

    items = sorted(items, key=lambda x: (x.day_number, x.plan_date, x.id))

    result               = []
    previous_completed   = True
    current_item_id      = None
    updated_any_item     = False

    for item in items:
        total_questions = session.exec(
            select(VideoAssessment).where(
                VideoAssessment.syllabus_id == syllabus_id,
                VideoAssessment.video_id    == item.video_id,
            )
        ).all()

        submissions = session.exec(
            select(AssessmentSubmission).where(
                AssessmentSubmission.user_email   == email,
                AssessmentSubmission.syllabus_id  == syllabus_id,
                AssessmentSubmission.video_id     == item.video_id,
            )
        ).all()

        answered_ids     = {s.assessment_id for s in submissions}
        derived_completed = (
            len(total_questions) > 0 and len(answered_ids) >= len(total_questions)
        )

        completed = bool(item.is_completed or derived_completed)
        unlocked  = previous_completed

        if completed and not item.is_completed:
            item.is_completed = True
            session.add(item)
            updated_any_item = True

        if unlocked and not completed and current_item_id is None:
            current_item_id = item.id

        result.append(
            {
                "id":              item.id,
                "day":             item.day_number,
                "date":            item.plan_date.isoformat(),
                "topic":           item.topic,
                "task":            item.task,
                "priority":        item.priority,
                "estimated_hours": item.estimated_hours,
                "video_id":        item.video_id,
                "video_title":     item.video_title,
                "video_url":       item.video_url,
                "unlocked":        unlocked,
                "completed":       completed,
                "answered_count":  len(answered_ids),
                "total_questions": len(total_questions),
            }
        )

        previous_completed = completed

    if updated_any_item:
        session.commit()

    return {
        "study_plan_id":  plan.id,
        "syllabus_id":    syllabus_id,
        "title":          plan.title,
        "summary":        plan.summary,
        "end_date":       plan.end_date.isoformat(),
        "hours_per_day":  plan.hours_per_day,
        # backward-compatible single playlist fields
        "playlist_id":    playlists[0].playlist_id  if playlists else None,
        "playlist_url":   playlists[0].playlist_url if playlists else None,
        # full list
        "playlists": [
            {"playlist_id": p.playlist_id, "playlist_url": p.playlist_url}
            for p in playlists
        ],
        "current_item_id": current_item_id,
        "items":           result,
    }


# ---------------------------------------------------------------------------
# GET /{syllabus_id}
# ---------------------------------------------------------------------------

@router.get("/{syllabus_id}")
def get_study_plan(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    plan = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        )
    ).first()

    if not plan:
        raise HTTPException(status_code=404, detail="No saved study plan found")

    playlists = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).all()

    items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.study_plan_id == plan.id)
    ).all()

    return serialize_study_plan(plan, items, playlists)
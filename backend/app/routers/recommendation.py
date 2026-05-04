from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_email
from app.models import Syllabus, TopicPerformance, SyllabusPlaylist
from app.services.recommendation_service import make_recommendation
import httpx
from app.config import settings

router = APIRouter()


async def fetch_playlist_videos(playlist_id: str, max_results: int = 50) -> list[dict]:
    if not settings.youtube_api_key:
        raise ValueError("YOUTUBE_API_KEY not set in .env")

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        "part": "snippet,contentDetails",
        "playlistId": playlist_id,
        "maxResults": max_results,
        "key": settings.youtube_api_key,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            raise ValueError(f"YouTube API error: {r.text}")

        js = r.json()

    videos = []
    for it in js.get("items", []):
        snip = it["snippet"]
        vid = snip["resourceId"]["videoId"]
        videos.append({
            "title": snip["title"],
            "videoId": vid,
            "position": snip.get("position"),
            "url": f"https://www.youtube.com/watch?v={vid}&list={playlist_id}",
            "thumbnail": snip.get("thumbnails", {}).get("high", {}).get("url"),
            "channel": snip.get("videoOwnerChannelTitle") or snip.get("channelTitle"),
        })

    videos.sort(key=lambda x: (x["position"] is None, x["position"]))
    return videos


@router.get("/topic/{syllabus_id}/{topic_name}")
async def recommend_for_topic(
    syllabus_id: int,
    topic_name: str,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    perf = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
            TopicPerformance.topic_name == topic_name,
        )
    ).first()

    if not perf:
        raise HTTPException(status_code=404, detail="No performance data found for this topic")

    saved_playlist = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).first()

    if not saved_playlist:
        raise HTTPException(status_code=404, detail="No playlist linked to this syllabus")

    try:
        videos = await fetch_playlist_videos(saved_playlist.playlist_id, max_results=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    related_videos = [
        v for v in videos
        if topic_name.lower() in v["title"].lower()
    ]

    if not related_videos:
        related_videos = videos[:2]

    recommendation = make_recommendation(
        topic_name=topic_name,
        mastery_percentage=perf.mastery_percentage,
        related_videos=related_videos,
    )

    return {
        "topic_name": topic_name,
        "mastery_percentage": perf.mastery_percentage,
        "feedback": perf.feedback,
        "recommendation": recommendation,
    }


@router.get("/weak-topics/{syllabus_id}")
async def recommend_for_weak_topics(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    topic_perfs = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
        )
    ).all()

    weak_topics = [tp for tp in topic_perfs if tp.mastery_percentage < 60]

    if not weak_topics:
        return {
            "syllabus_id": syllabus_id,
            "message": "No weak topics found. You are doing well.",
            "recommendations": []
        }

    saved_playlist = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).first()

    if not saved_playlist:
        raise HTTPException(status_code=404, detail="No playlist linked to this syllabus")

    try:
        videos = await fetch_playlist_videos(saved_playlist.playlist_id, max_results=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    recommendations = []
    for tp in weak_topics:
        related_videos = [
            v for v in videos
            if tp.topic_name.lower() in v["title"].lower()
        ]
        if not related_videos:
            related_videos = videos[:2]

        rec = make_recommendation(tp.topic_name, tp.mastery_percentage, related_videos)
        recommendations.append({
            "topic_name": tp.topic_name,
            "mastery_percentage": tp.mastery_percentage,
            "feedback": tp.feedback,
            "recommendation": rec,
        })

    return {
        "syllabus_id": syllabus_id,
        "recommendations": recommendations,
    }
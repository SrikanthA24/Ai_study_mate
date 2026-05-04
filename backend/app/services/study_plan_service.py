from datetime import date
from sqlmodel import Session, select

from app.models import SRSCard


# ---------------------------------------------------------------------------
# Build day-wise plan with hard day cap
# ---------------------------------------------------------------------------

def build_daywise_plan(
    recommendations: list[dict],
    max_days: int | None = None,
    hours_per_day: float = 2.0,
) -> tuple[list[dict], bool]:
    """
    Build a day-wise study plan from recommendations.

    - If max_days is None, behaviour is unchanged (one day per topic).
    - If max_days is set, topics are compressed proportionally to fit.
      Topics that cannot fit are dropped; at least 1 day is always given
      to the first max_days topics.

    Returns:
        plan          – list of day dicts (same structure as before)
        is_compressed – True if content was squeezed / truncated to fit the limit
    """
    if not recommendations:
        return [], False

    total_topics = len(recommendations)
    is_compressed = False

    # --- Decide how many days each topic gets ----------------------------
    if max_days is None or total_topics <= max_days:
        # Every topic gets exactly 1 day — original behaviour
        days_per_topic = [1] * total_topics

    else:
        is_compressed = True
        base = max_days // total_topics          # minimum days per topic
        remainder = max_days % total_topics      # leftover days to spread

        # Give 'base' days to every topic, then 1 extra to the first
        # 'remainder' topics (prioritise earlier / harder topics).
        days_per_topic = [
            base + (1 if i < remainder else 0)
            for i in range(total_topics)
        ]

        # Safety: ensure no topic gets 0 days
        days_per_topic = [max(1, d) for d in days_per_topic]

        # If even 1-day-per-topic still exceeds the cap, truncate topic list
        if sum(days_per_topic) > max_days:
            days_per_topic = [1] * max_days
            recommendations = recommendations[:max_days]
            total_topics = max_days

    # --- Build the plan --------------------------------------------------
    plan = []
    day = 1

    for i, rec in enumerate(recommendations):
        topic_name         = rec["topic_name"]
        mastery_percentage = rec.get("mastery_percentage", 0.0)
        feedback           = rec.get("feedback", "")
        recommendation     = rec.get("recommendation", {})
        action             = recommendation.get("action")
        videos             = recommendation.get("recommended_videos", [])
        allotted_days      = days_per_topic[i]

        tasks = []

        if action == "rewatch_and_retry":
            for video in videos:
                tasks.append(f"Watch video: {video['title']}")
            tasks.append(f"Read summary for topic: {topic_name}")
            tasks.append(f"Retry quiz for topic: {topic_name}")

        elif action == "revise_and_retry":
            tasks.append(f"Read summary for topic: {topic_name}")
            if videos:
                tasks.append(f"Revise video: {videos[0]['title']}")
            tasks.append(f"Retry quiz for topic: {topic_name}")

        elif action == "next_topic":
            tasks.append(
                f"Move to next topic after completing revision for {topic_name}"
            )

        else:
            tasks.append(f"Study topic: {topic_name}")

        plan.append(
            {
                "day":                day,
                "end_day":            day + allotted_days - 1,
                "allotted_days":      allotted_days,
                "topic_name":         topic_name,
                "mastery_percentage": round(mastery_percentage, 2),
                "feedback":           feedback,
                "tasks":              tasks,
                "is_compressed":      is_compressed,
            }
        )

        day += allotted_days

    return plan, is_compressed


# ---------------------------------------------------------------------------
# SRS — get due review cards for a user
# ---------------------------------------------------------------------------

def get_due_srs_cards(db: Session, user_email: str, syllabus_id: int) -> list[SRSCard]:
    """
    Return all SRS cards due for review today or overdue,
    for a specific user and syllabus.
    """
    today = date.today()
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == syllabus_id)
        .where(SRSCard.srs_next_review <= today)
        .order_by(SRSCard.srs_next_review)
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# SRS — inject due reviews into an existing day-wise plan
# ---------------------------------------------------------------------------

def inject_srs_reviews_into_plan(
    plan: list[dict],
    db: Session,
    user_email: str,
    syllabus_id: int,
) -> list[dict]:
    """
    Takes the output of build_daywise_plan() and appends SRS review
    tasks to day 1 for any topics that are due today or overdue.

    The original plan structure is preserved completely — SRS tasks
    are only added as extra items inside the existing 'tasks' list
    of day 1, along with a new 'srs_reviews' key for the frontend
    to optionally render separately.

    If there are no due cards, the plan is returned unchanged.
    """
    due_cards = get_due_srs_cards(db, user_email, syllabus_id)

    if not due_cards:
        return plan

    srs_tasks   = []
    srs_reviews = []

    for card in due_cards:
        srs_tasks.append(f"SRS Review: {card.topic_name}")
        srs_reviews.append(
            {
                "card_id":      card.id,
                "topic_name":   card.topic_name,
                "srs_interval": card.srs_interval,
                "srs_ef":       round(card.srs_ef, 4),
                "srs_n":        card.srs_n,
                "due_date":     str(card.srs_next_review),
            }
        )

    # Inject into day 1 only (today's plan)
    if plan:
        plan[0]["tasks"]       = srs_tasks + plan[0]["tasks"]
        plan[0]["srs_reviews"] = srs_reviews
    else:
        # Edge case: plan is empty but reviews are due
        plan.append(
            {
                "day":                1,
                "end_day":            1,
                "allotted_days":      1,
                "topic_name":         "SRS Reviews",
                "mastery_percentage": 0.0,
                "feedback":           "Topics due for spaced repetition review.",
                "tasks":              srs_tasks,
                "srs_reviews":        srs_reviews,
                "is_compressed":      False,
            }
        )

    return plan
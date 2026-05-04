from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from datetime import datetime, date, timedelta
from pydantic import BaseModel

from app.db import get_session
from app.models import SRSCard, SRSReview
from app.deps import get_current_email

router = APIRouter()


class SRSReviewRequest(BaseModel):
    syllabus_id: int
    topic_name: str
    quality: int  # 0–5


def calculate_sm2(n: int, ef: float, interval: int, quality: int):
    if quality < 3:
        return 0, ef, 1

    new_ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(1.3, new_ef)

    new_n = n + 1
    if new_n == 1:
        new_interval = 1
    elif new_n == 2:
        new_interval = 6
    else:
        new_interval = round(interval * new_ef)

    return new_n, round(new_ef, 4), new_interval


@router.post("/review")
def submit_review(
    body: SRSReviewRequest,
    db: Session = Depends(get_session),
    user_email: str = Depends(get_current_email),
):
    if not 0 <= body.quality <= 5:
        raise HTTPException(status_code=400, detail="Quality must be between 0 and 5")

    # Get or create the SRS card for this user + topic
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == body.syllabus_id)
        .where(SRSCard.topic_name == body.topic_name)
    )
    card = db.exec(statement).first()

    if not card:
        card = SRSCard(
            user_email=user_email,
            syllabus_id=body.syllabus_id,
            topic_name=body.topic_name,
        )
        db.add(card)
        db.commit()
        db.refresh(card)

    # Snapshot before update (for audit log)
    ef_before       = card.srs_ef
    interval_before = card.srs_interval
    n_before        = card.srs_n

    # Run SM-2
    new_n, new_ef, new_interval = calculate_sm2(
        card.srs_n, card.srs_ef, card.srs_interval, body.quality
    )

    # Update card
    card.srs_n            = new_n
    card.srs_ef           = new_ef
    card.srs_interval     = new_interval
    card.srs_next_review  = date.today() + timedelta(days=new_interval)
    card.last_reviewed_at = datetime.utcnow()
    card.total_reviews   += 1
    if body.quality >= 3:
        card.total_correct += 1

    db.add(card)

    # Save review log
    review = SRSReview(
        card_id         = card.id,
        user_email      = user_email,
        syllabus_id     = body.syllabus_id,
        quality         = body.quality,
        ef_before       = ef_before,
        ef_after        = new_ef,
        interval_before = interval_before,
        interval_after  = new_interval,
        n_before        = n_before,
        n_after         = new_n,
    )
    db.add(review)
    db.commit()
    db.refresh(card)

    return {
        "topic_name":    card.topic_name,
        "next_review":   str(card.srs_next_review),
        "interval_days": card.srs_interval,
        "ef":            card.srs_ef,
        "total_reviews": card.total_reviews,
    }


@router.get("/due")
def get_due_cards(
    syllabus_id: int,
    db: Session = Depends(get_session),
    user_email: str = Depends(get_current_email),
):
    today = date.today()
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == syllabus_id)
        .where(SRSCard.srs_next_review <= today)
        .order_by(SRSCard.srs_next_review)
    )
    return db.exec(statement).all()


@router.get("/cards")
def get_all_cards(
    syllabus_id: int,
    db: Session = Depends(get_session),
    user_email: str = Depends(get_current_email),
):
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == syllabus_id)
        .order_by(SRSCard.srs_next_review)
    )
    return db.exec(statement).all()
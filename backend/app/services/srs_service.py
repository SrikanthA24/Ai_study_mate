# app/services/srs_service.py
from datetime import datetime, date, timedelta
from sqlmodel import Session, select

from app.models import SRSCard, SRSReview


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


def update_topic_srs(db: Session, user_email: str, syllabus_id: int, topic_name: str, quality: int):
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == syllabus_id)
        .where(SRSCard.topic_name == topic_name)
    )
    card = db.exec(statement).first()

    if not card:
        card = SRSCard(
            user_email=user_email,
            syllabus_id=syllabus_id,
            topic_name=topic_name,
        )
        db.add(card)
        db.commit()
        db.refresh(card)

    ef_before       = card.srs_ef
    interval_before = card.srs_interval
    n_before        = card.srs_n

    new_n, new_ef, new_interval = calculate_sm2(
        card.srs_n, card.srs_ef, card.srs_interval, quality
    )

    card.srs_n            = new_n
    card.srs_ef           = new_ef
    card.srs_interval     = new_interval
    card.srs_next_review  = date.today() + timedelta(days=new_interval)
    card.last_reviewed_at = datetime.utcnow()
    card.total_reviews   += 1
    if quality >= 3:
        card.total_correct += 1

    db.add(card)

    review = SRSReview(
        card_id         = card.id,
        user_email      = user_email,
        syllabus_id     = syllabus_id,
        quality         = quality,
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
    return card


def get_due_topics(db: Session, user_email: str, syllabus_id: int):
    today = date.today()
    statement = (
        select(SRSCard)
        .where(SRSCard.user_email == user_email)
        .where(SRSCard.syllabus_id == syllabus_id)
        .where(SRSCard.srs_next_review <= today)
        .order_by(SRSCard.srs_next_review)
    )
    return db.exec(statement).all()
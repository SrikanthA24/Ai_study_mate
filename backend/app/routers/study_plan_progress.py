import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_email
from app.models import Syllabus, StudyPlan

router = APIRouter()


class SaveStudyPlanIn(BaseModel):
    syllabus_id: int
    study_plan: list[dict]


@router.post("/save")
def save_study_plan(
    data: SaveStudyPlanIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    old_items = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == data.syllabus_id,
        )
    ).all()

    for item in old_items:
        session.delete(item)

    session.commit()

    saved_items = []
    for item in data.study_plan:
        sp = StudyPlan(
            user_email=email,
            syllabus_id=data.syllabus_id,
            day_number=item["day"],
            topic_name=item["topic_name"],
            tasks_json=json.dumps(item["tasks"]),
            is_completed=False,
        )
        session.add(sp)
        saved_items.append(sp)

    session.commit()

    return {
        "message": "Study plan saved successfully",
        "syllabus_id": data.syllabus_id,
        "days_saved": len(saved_items),
    }


@router.get("/{syllabus_id}")
def get_saved_study_plan(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    items = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        ).order_by(StudyPlan.day_number)
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="No saved study plan found")

    result = []
    for item in items:
        result.append({
            "id": item.id,
            "day": item.day_number,
            "topic_name": item.topic_name,
            "tasks": json.loads(item.tasks_json),
            "is_completed": item.is_completed,
            "completed_at": item.completed_at,
        })

    return {
        "syllabus_id": syllabus_id,
        "study_plan": result,
    }


@router.post("/complete/{plan_id}")
def mark_day_completed(
    plan_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    item = session.get(StudyPlan, plan_id)
    if not item or item.user_email != email:
        raise HTTPException(status_code=404, detail="Study plan day not found")

    item.is_completed = True
    item.completed_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)

    return {
        "message": "Day marked as completed",
        "plan_id": item.id,
        "day": item.day_number,
        "completed_at": item.completed_at,
    }


@router.get("/progress/{syllabus_id}")
def get_study_plan_progress(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    items = session.exec(
        select(StudyPlan).where(
            StudyPlan.user_email == email,
            StudyPlan.syllabus_id == syllabus_id,
        )
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="No saved study plan found")

    total_days = len(items)
    completed_days = sum(1 for item in items if item.is_completed)
    progress_percentage = (completed_days / total_days) * 100 if total_days > 0 else 0

    pending_days = [
        {
            "id": item.id,
            "day": item.day_number,
            "topic_name": item.topic_name,
        }
        for item in items if not item.is_completed
    ]

    return {
        "syllabus_id": syllabus_id,
        "total_days": total_days,
        "completed_days": completed_days,
        "progress_percentage": round(progress_percentage, 2),
        "pending_days": pending_days,
    }
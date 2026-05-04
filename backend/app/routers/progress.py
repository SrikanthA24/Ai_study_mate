from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_email
from app.models import (
    AssessmentSubmission,
    StudyPlan,
    StudyPlanItem,
    VideoAssessment,
)

router = APIRouter()


@router.get("/course-progress/{syllabus_id}")
def get_course_progress(
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
        raise HTTPException(status_code=404, detail="Study plan not found")

    items = session.exec(
        select(StudyPlanItem).where(
            StudyPlanItem.study_plan_id == plan.id
        )
    ).all()

    total_videos = len(items)
    completed_videos = sum(1 for item in items if item.is_completed)

    submissions = session.exec(
        select(AssessmentSubmission).where(
            AssessmentSubmission.user_email == email,
            AssessmentSubmission.syllabus_id == syllabus_id,
        )
    ).all()

    marks_scored = sum(1 for s in submissions if s.is_correct)
    total_questions = len(submissions)

    progress_percentage = 0.0
    if total_videos > 0:
        progress_percentage = round((completed_videos / total_videos) * 100, 2)

    return {
        "syllabus_id": syllabus_id,
        "progress_percentage": progress_percentage,
        "videos_completed": completed_videos,
        "total_videos": total_videos,
        "marks_scored": marks_scored,
        "total_questions": total_questions,
    }


@router.get("/video-result/{syllabus_id}/{video_id}")
def get_video_result(
    syllabus_id: int,
    video_id: str,
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
        raise HTTPException(status_code=404, detail="Study plan not found")

    questions = session.exec(
        select(VideoAssessment).where(
            VideoAssessment.syllabus_id == syllabus_id,
            VideoAssessment.video_id == video_id,
        )
    ).all()

    if not questions:
        raise HTTPException(status_code=404, detail="No assessment found for this video")

    submissions = session.exec(
        select(AssessmentSubmission).where(
            AssessmentSubmission.user_email == email,
            AssessmentSubmission.syllabus_id == syllabus_id,
            AssessmentSubmission.video_id == video_id,
        )
    ).all()

    answered_ids = {s.assessment_id for s in submissions}
    correct_answers = sum(1 for s in submissions if s.is_correct)
    total_questions = len(questions)

    score_percentage = 0.0
    if total_questions > 0:
        score_percentage = round((correct_answers / total_questions) * 100, 2)

    is_video_completed = len(answered_ids) >= total_questions and total_questions > 0

    plan_item = session.exec(
        select(StudyPlanItem).where(
            StudyPlanItem.study_plan_id == plan.id,
            StudyPlanItem.video_id == video_id,
        )
    ).first()

    if plan_item and is_video_completed and not plan_item.is_completed:
        plan_item.is_completed = True
        session.add(plan_item)
        session.commit()
        session.refresh(plan_item)

    items = session.exec(
        select(StudyPlanItem).where(
            StudyPlanItem.study_plan_id == plan.id
        )
    ).all()

    total_videos = len(items)
    completed_videos = sum(1 for item in items if item.is_completed)

    course_progress_percentage = 0.0
    if total_videos > 0:
        course_progress_percentage = round((completed_videos / total_videos) * 100, 2)

    return {
        "syllabus_id": syllabus_id,
        "video_id": video_id,
        "score_percentage": score_percentage,
        "correct_answers": correct_answers,
        "total_questions": total_questions,
        "video_completed": is_video_completed,
        "course_progress_percentage": course_progress_percentage,
        "videos_completed": completed_videos,
        "total_videos": total_videos,
    }
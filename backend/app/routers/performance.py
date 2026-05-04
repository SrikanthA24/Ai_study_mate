from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_email
from app.models import (
    Syllabus,
    VideoAssessment,
    AssessmentSubmission,
    TopicPerformance,
    StudyPlan,
    StudyPlanItem,
)
from app.services.performance_service import generate_feedback

router = APIRouter()


class SubmitAnswerIn(BaseModel):
    syllabus_id: int
    video_id: str
    assessment_id: int
    selected_option: str
    topic_name: str


def get_mastery_level(mastery_percentage: float) -> str:
    if mastery_percentage >= 80:
        return "strong"
    elif mastery_percentage >= 50:
        return "medium"
    return "weak"


@router.post("/submit")
def submit_answer(
    data: SubmitAnswerIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    question = session.get(VideoAssessment, data.assessment_id)
    if not question:
        raise HTTPException(status_code=404, detail="Assessment question not found")

    selected_option = data.selected_option.strip().upper()
    is_correct = question.correct_option.strip().upper() == selected_option

    existing_submission = session.exec(
        select(AssessmentSubmission).where(
            AssessmentSubmission.user_email == email,
            AssessmentSubmission.syllabus_id == data.syllabus_id,
            AssessmentSubmission.video_id == data.video_id,
            AssessmentSubmission.assessment_id == data.assessment_id,
        )
    ).first()

    if existing_submission:
        existing_submission.selected_option = selected_option
        existing_submission.is_correct = is_correct
        existing_submission.topic_name = data.topic_name
        existing_submission.submitted_at = datetime.utcnow()
        session.add(existing_submission)
    else:
        submission = AssessmentSubmission(
            user_email=email,
            syllabus_id=data.syllabus_id,
            video_id=data.video_id,
            assessment_id=data.assessment_id,
            selected_option=selected_option,
            is_correct=is_correct,
            topic_name=data.topic_name,
        )
        session.add(submission)

    session.commit()

    all_submissions = session.exec(
        select(AssessmentSubmission).where(
            AssessmentSubmission.user_email == email,
            AssessmentSubmission.syllabus_id == data.syllabus_id,
            AssessmentSubmission.topic_name == data.topic_name,
        )
    ).all()

    total_questions = len(all_submissions)
    correct_answers = sum(1 for s in all_submissions if s.is_correct)
    mastery_percentage = (correct_answers / total_questions) * 100 if total_questions > 0 else 0.0
    mastery_level = get_mastery_level(mastery_percentage)
    needs_revision = mastery_level != "strong"
    feedback = generate_feedback(data.topic_name, mastery_percentage)

    topic_perf = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == data.syllabus_id,
            TopicPerformance.topic_name == data.topic_name,
        )
    ).first()

    if topic_perf:
        topic_perf.total_questions = total_questions
        topic_perf.correct_answers = correct_answers
        topic_perf.mastery_percentage = mastery_percentage
        topic_perf.mastery_level = mastery_level
        topic_perf.needs_revision = needs_revision
        topic_perf.last_score = mastery_percentage
        topic_perf.feedback = feedback
        topic_perf.updated_at = datetime.utcnow()
        session.add(topic_perf)
    else:
        topic_perf = TopicPerformance(
            user_email=email,
            syllabus_id=data.syllabus_id,
            topic_name=data.topic_name,
            total_questions=total_questions,
            correct_answers=correct_answers,
            mastery_percentage=mastery_percentage,
            mastery_level=mastery_level,
            needs_revision=needs_revision,
            last_score=mastery_percentage,
            feedback=feedback,
        )
        session.add(topic_perf)

    session.commit()

    video_questions = session.exec(
        select(VideoAssessment).where(
            VideoAssessment.syllabus_id == data.syllabus_id,
            VideoAssessment.video_id == data.video_id,
        )
    ).all()

    video_submissions = session.exec(
        select(AssessmentSubmission).where(
            AssessmentSubmission.user_email == email,
            AssessmentSubmission.syllabus_id == data.syllabus_id,
            AssessmentSubmission.video_id == data.video_id,
        )
    ).all()

    answered_ids = {s.assessment_id for s in video_submissions}
    video_completed = len(video_questions) > 0 and len(answered_ids) >= len(video_questions)

    if video_completed:
        saved_plan = session.exec(
            select(StudyPlan).where(
                StudyPlan.user_email == email,
                StudyPlan.syllabus_id == data.syllabus_id,
            )
        ).first()

        if saved_plan:
            plan_item = session.exec(
                select(StudyPlanItem).where(
                    StudyPlanItem.study_plan_id == saved_plan.id,
                    StudyPlanItem.video_id == data.video_id,
                )
            ).first()

            if plan_item and not plan_item.is_completed:
                plan_item.is_completed = True
                session.add(plan_item)
                session.commit()

    return {
        "is_correct": is_correct,
        "correct_option": question.correct_option,
        "mastery_percentage": round(mastery_percentage, 2),
        "mastery_level": mastery_level,
        "needs_revision": needs_revision,
        "feedback": feedback,
        "video_completed": video_completed,
        "answered_count": len(answered_ids),
        "total_questions_for_video": len(video_questions),
    }


@router.get("/topic/{syllabus_id}/{topic_name}")
def get_topic_performance(
    syllabus_id: int,
    topic_name: str,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    perf = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
            TopicPerformance.topic_name == topic_name,
        )
    ).first()

    if not perf:
        raise HTTPException(status_code=404, detail="No performance data found for this topic")

    return perf


@router.get("/weak-topics/{syllabus_id}")
def get_weak_topics(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    topics = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
        )
    ).all()

    weak_topics = [t for t in topics if t.mastery_percentage < 60]

    return {
        "syllabus_id": syllabus_id,
        "weak_topics": weak_topics,
    }


@router.get("/report/{syllabus_id}")
def get_full_report(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    topics = session.exec(
        select(TopicPerformance).where(
            TopicPerformance.user_email == email,
            TopicPerformance.syllabus_id == syllabus_id,
        )
    ).all()

    if not topics:
        raise HTTPException(status_code=404, detail="No performance data found")

    overall_score = sum(t.mastery_percentage for t in topics) / len(topics)
    strong_topics = [t.topic_name for t in topics if t.mastery_percentage >= 80]
    weak_topics = [t.topic_name for t in topics if t.mastery_percentage < 60]

    recommendation = (
        "Focus on weak topics, revise summaries, and retry assessments."
        if weak_topics
        else "You are doing well. Continue to the next topics."
    )

    return {
        "overall_score": round(overall_score, 2),
        "strong_topics": strong_topics,
        "weak_topics": weak_topics,
        "recommendation": recommendation,
    }
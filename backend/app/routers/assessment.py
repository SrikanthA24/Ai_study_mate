from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_email
from app.models import Syllabus, VideoSummary, VideoAssessment
from app.services.assessment_service import (
    fetch_transcript_text,
    summarize_transcript,
    generate_mcqs_from_summary,
)

router = APIRouter()


class GenerateAssessmentIn(BaseModel):
    syllabus_id: int
    video_id: str
    video_title: str


@router.post("/generate-from-video")
def generate_from_video(
    data: GenerateAssessmentIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    try:
        transcript_text = fetch_transcript_text(data.video_id)
        summary_text = summarize_transcript(transcript_text)
        mcqs = generate_mcqs_from_summary(summary_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    existing_summary = session.exec(
        select(VideoSummary).where(
            VideoSummary.syllabus_id == data.syllabus_id,
            VideoSummary.video_id == data.video_id,
        )
    ).first()

    if existing_summary:
        existing_summary.video_title = data.video_title
        existing_summary.transcript_text = transcript_text
        existing_summary.summary_text = summary_text
        session.add(existing_summary)
    else:
        existing_summary = VideoSummary(
            syllabus_id=data.syllabus_id,
            video_id=data.video_id,
            video_title=data.video_title,
            transcript_text=transcript_text,
            summary_text=summary_text,
        )
        session.add(existing_summary)

    old_questions = session.exec(
        select(VideoAssessment).where(
            VideoAssessment.syllabus_id == data.syllabus_id,
            VideoAssessment.video_id == data.video_id,
        )
    ).all()

    for q in old_questions:
        session.delete(q)

    session.commit()

    for q in mcqs:
        item = VideoAssessment(
            syllabus_id=data.syllabus_id,
            video_id=data.video_id,
            question=q["question"],
            option_a=q["option_a"],
            option_b=q["option_b"],
            option_c=q["option_c"],
            option_d=q["option_d"],
            correct_option=q["correct_option"],
            explanation=q.get("explanation"),
        )
        session.add(item)

    session.commit()

    return {
        "message": "Assessment generated successfully",
        "syllabus_id": data.syllabus_id,
        "video_id": data.video_id,
        "questions_count": len(mcqs),
        "summary_preview": summary_text[:400],
    }


@router.get("/summary/{syllabus_id}/{video_id}")
def get_summary(
    syllabus_id: int,
    video_id: str,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    summary = session.exec(
        select(VideoSummary).where(
            VideoSummary.syllabus_id == syllabus_id,
            VideoSummary.video_id == video_id,
        )
    ).first()

    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    return {
        "syllabus_id": syllabus_id,
        "video_id": video_id,
        "video_title": summary.video_title,
        "summary_text": summary.summary_text,
    }


@router.get("/{syllabus_id}/{video_id}")
def get_assessment(
    syllabus_id: int,
    video_id: str,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    questions = session.exec(
        select(VideoAssessment).where(
            VideoAssessment.syllabus_id == syllabus_id,
            VideoAssessment.video_id == video_id,
        )
    ).all()

    if not questions:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return questions
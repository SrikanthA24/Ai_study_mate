import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

# Optional OpenAI import
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.deps import get_current_email
from app.models import DocumentChunk, DoubtHistory, Syllabus, VideoSummary

router = APIRouter()


class AskDoubtIn(BaseModel):
    syllabus_id: int
    question: str
    video_id: Optional[str] = None
    top_k: int = 5


def get_ai_client():
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


def normalize_text(text: str) -> str:
    text = text or ""
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 120) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []

    chunks = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - overlap, start + 1)

    return chunks


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9_]+", (text or "").lower())


def score_chunk(
    question: str,
    chunk: str,
    source_type: str,
    source_ref: str,
    current_video_id: Optional[str],
    chunk_video_id: Optional[str],
) -> float:
    q_tokens = set(tokenize(question))
    c_tokens = tokenize(chunk)

    if not q_tokens or not c_tokens:
        return 0.0

    c_token_set = set(c_tokens)
    overlap = len(q_tokens.intersection(c_token_set))
    coverage = overlap / max(1, len(q_tokens))

    score = coverage * 10.0

    question_lower = question.lower()
    chunk_lower = chunk.lower()

    for token in q_tokens:
        if len(token) >= 4 and token in chunk_lower:
            score += 0.4

    if question_lower in chunk_lower:
        score += 3.0

    if source_type == "syllabus":
        score += 1.2
    elif source_type == "notes":
        score += 1.0
    elif source_type == "transcript":
        score += 0.8

    if current_video_id and chunk_video_id and current_video_id == chunk_video_id:
        score += 2.0

    if source_ref and source_ref.lower() in question_lower:
        score += 0.8

    return round(score, 4)


def ensure_syllabus_chunks(session: Session, email: str, syllabus: Syllabus):
    existing = session.exec(
        select(DocumentChunk).where(
            DocumentChunk.owner_email == email,
            DocumentChunk.syllabus_id == syllabus.id,
            DocumentChunk.source_type == "syllabus",
        )
    ).first()

    if existing:
        return

    chunks = chunk_text(syllabus.raw_text or "")
    for idx, chunk in enumerate(chunks):
        session.add(
            DocumentChunk(
                owner_email=email,
                syllabus_id=syllabus.id,
                source_type="syllabus",
                source_ref=syllabus.title,
                video_id=None,
                chunk_index=idx,
                chunk_text=chunk,
                metadata_json=json.dumps({"title": syllabus.title}),
            )
        )


def ensure_video_chunks(session: Session, email: str, syllabus_id: int):
    summaries = session.exec(
        select(VideoSummary).where(VideoSummary.syllabus_id == syllabus_id)
    ).all()

    for summary in summaries:
        existing = session.exec(
            select(DocumentChunk).where(
                DocumentChunk.owner_email == email,
                DocumentChunk.syllabus_id == syllabus_id,
                DocumentChunk.video_id == summary.video_id,
            )
        ).first()

        if existing:
            continue

        transcript_chunks = chunk_text(summary.transcript_text or "")
        summary_chunks = chunk_text(summary.summary_text or "")

        for idx, chunk in enumerate(transcript_chunks):
            session.add(
                DocumentChunk(
                    owner_email=email,
                    syllabus_id=syllabus_id,
                    source_type="transcript",
                    source_ref=summary.video_title,
                    video_id=summary.video_id,
                    chunk_index=idx,
                    chunk_text=chunk,
                    metadata_json=json.dumps(
                        {
                            "video_id": summary.video_id,
                            "video_title": summary.video_title,
                            "kind": "transcript",
                        }
                    ),
                )
            )

        offset = len(transcript_chunks)
        for idx, chunk in enumerate(summary_chunks):
            session.add(
                DocumentChunk(
                    owner_email=email,
                    syllabus_id=syllabus_id,
                    source_type="notes",
                    source_ref=summary.video_title,
                    video_id=summary.video_id,
                    chunk_index=offset + idx,
                    chunk_text=chunk,
                    metadata_json=json.dumps(
                        {
                            "video_id": summary.video_id,
                            "video_title": summary.video_title,
                            "kind": "summary",
                        }
                    ),
                )
            )


def ensure_chunks_indexed(session: Session, email: str, syllabus_id: int):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    ensure_syllabus_chunks(session, email, syllabus)
    ensure_video_chunks(session, email, syllabus_id)
    session.commit()


def save_doubt_history(
    session: Session,
    email: str,
    syllabus_id: int,
    video_id: Optional[str],
    question: str,
    answer: str,
    answer_mode: str,
    sources: list,
):
    history_row = DoubtHistory(
        user_email=email,
        syllabus_id=syllabus_id,
        video_id=video_id,
        question=question.strip(),
        answer=answer,
        answer_mode=answer_mode,
        sources_json=json.dumps(sources),
    )
    session.add(history_row)
    session.commit()


@router.post("/reindex/{syllabus_id}")
def reindex_doubt_sources(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    old_chunks = session.exec(
        select(DocumentChunk).where(
            DocumentChunk.owner_email == email,
            DocumentChunk.syllabus_id == syllabus_id,
        )
    ).all()

    for row in old_chunks:
        session.delete(row)

    session.commit()
    ensure_chunks_indexed(session, email, syllabus_id)

    total = session.exec(
        select(DocumentChunk).where(
            DocumentChunk.owner_email == email,
            DocumentChunk.syllabus_id == syllabus_id,
        )
    ).all()

    return {
        "message": "Doubt solver sources indexed successfully",
        "total_chunks": len(total),
    }


@router.post("/ask")
def ask_doubt(
    data: AskDoubtIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    question = (data.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    ensure_chunks_indexed(session, email, data.syllabus_id)

    chunks = session.exec(
        select(DocumentChunk).where(
            DocumentChunk.owner_email == email,
            DocumentChunk.syllabus_id == data.syllabus_id,
        )
    ).all()

    scored = []
    for chunk in chunks:
        score = score_chunk(
            question=question,
            chunk=chunk.chunk_text,
            source_type=chunk.source_type,
            source_ref=chunk.source_ref,
            current_video_id=data.video_id,
            chunk_video_id=chunk.video_id,
        )
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = scored[: max(1, min(data.top_k, 8))]

    top_score = selected[0][0] if selected else 0.0

    context_blocks = []
    sources = []

    for score, chunk in selected:
        context_blocks.append(
            f"[SOURCE TYPE: {chunk.source_type} | SOURCE: {chunk.source_ref} | VIDEO ID: {chunk.video_id or 'N/A'}]\n{chunk.chunk_text}"
        )
        sources.append(
            {
                "source_type": chunk.source_type,
                "source_ref": chunk.source_ref,
                "video_id": chunk.video_id,
                "chunk_text": chunk.chunk_text[:280],
                "score": score,
            }
        )

    context = "\n\n---\n\n".join(context_blocks) if context_blocks else ""
    has_strong_grounding = top_score >= 8.5 and len(context_blocks) > 0

    client, model_name = get_ai_client()

    if has_strong_grounding:
        prompt = f"""
You are an academic tutor inside a study system.

Use the provided context strongly when answering.
You may use your own general subject knowledge only to improve clarity and completeness,
but do not contradict the provided context.

Keep the answer:
- correct
- student friendly
- concise but helpful
- suitable for a beginner if the question is basic

Student question:
{question}

Context:
{context}
"""
        answer_mode = "hybrid"
    else:
        prompt = f"""
You are a helpful academic tutor for computer science students.

Answer the student's question clearly and correctly.
Use simple language first, then give a slightly more technical explanation.
If relevant, include a short example.
Keep the answer concise but useful.

Student question:
{question}
"""
        answer_mode = "general_fallback"
        sources = []

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful and accurate academic tutor.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.3,
        )
        answer = response.choices[0].message.content.strip()
    except Exception:
        if answer_mode == "general_fallback":
            answer = "I could not generate the answer right now. Please try again."
        else:
            answer = "I found some relevant study material, but I could not generate a clear answer right now."

    save_doubt_history(
        session=session,
        email=email,
        syllabus_id=data.syllabus_id,
        video_id=data.video_id,
        question=question,
        answer=answer,
        answer_mode=answer_mode,
        sources=sources,
    )

    return {
        "answer": answer,
        "sources": sources,
        "mode": answer_mode,
    }


@router.get("/history/{syllabus_id}")
def get_doubt_history(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    rows = session.exec(
        select(DoubtHistory).where(
            DoubtHistory.user_email == email,
            DoubtHistory.syllabus_id == syllabus_id,
        )
    ).all()

    rows = sorted(rows, key=lambda x: x.created_at, reverse=True)

    return {
        "items": [
            {
                "id": row.id,
                "question": row.question,
                "answer": row.answer,
                "answer_mode": row.answer_mode,
                "video_id": row.video_id,
                "sources": json.loads(row.sources_json or "[]"),
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.delete("/history/{history_id}")
def delete_doubt_history_item(
    history_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    row = session.get(DoubtHistory, history_id)
    if not row or row.user_email != email:
        raise HTTPException(status_code=404, detail="Doubt history item not found")

    session.delete(row)
    session.commit()

    return {"message": "Doubt history item deleted successfully"}
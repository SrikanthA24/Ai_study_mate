from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlmodel import Session, select
from urllib.parse import urlparse, parse_qs
import httpx
import io

from app.db import get_session
from app.deps import get_current_email
from app.models import Syllabus, Topic, SyllabusPlaylist
from app.config import settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class SyllabusCreateIn(BaseModel):
    title: str
    raw_text: str


def simple_topic_extract(raw_text: str) -> list[str]:
    topics: list[str] = []
    for line in raw_text.splitlines():
        t = line.strip()
        if not t:
            continue
        t = t.lstrip("-*•").strip()
        if len(t) < 3:
            continue
        topics.append(t)

    seen = set()
    uniq: list[str] = []
    for t in topics:
        key = t.lower()
        if key not in seen:
            uniq.append(t)
            seen.add(key)

    return uniq[:50]


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract raw text from a PDF using pypdf.
    Raises HTTPException if the PDF is unreadable or image-based.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="pypdf is not installed. Run: pip install pypdf",
        )

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read the PDF file. It may be corrupted or password-protected.",
        )

    if not reader.pages:
        raise HTTPException(status_code=400, detail="PDF has no pages.")

    text_parts = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
        except Exception:
            continue  # skip unreadable pages silently

    full_text = "\n".join(text_parts).strip()

    if not full_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No text could be extracted from this PDF. "
                "It may be a scanned image-based PDF. "
                "Please use a text-based PDF or enter the syllabus manually."
            ),
        )

    return full_text


def extract_playlist_id(url: str) -> str | None:
    try:
        parsed = urlparse(url.strip())
        qs = parse_qs(parsed.query)
        return qs.get("list", [None])[0]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/create")
def create_syllabus(
    data: SyllabusCreateIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    """
    Create a syllabus from manual text input.
    """
    syllabus = Syllabus(owner_email=email, title=data.title, raw_text=data.raw_text)
    session.add(syllabus)
    session.commit()
    session.refresh(syllabus)

    extracted = simple_topic_extract(data.raw_text)
    for i, name in enumerate(extracted, start=1):
        session.add(Topic(syllabus_id=syllabus.id, name=name, order=i))
    session.commit()

    return {
        "syllabus_id": syllabus.id,
        "title": syllabus.title,
        "topics_count": len(extracted),
        "topics_preview": extracted[:10],
        "source": "manual",
    }


@router.post("/create-from-pdf")
async def create_syllabus_from_pdf(
    title: str = Form(...),
    file: UploadFile = File(...),
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    """
    Create a syllabus by uploading a PDF file.
    Text is extracted from the PDF, then topics are auto-extracted
    using the same simple_topic_extract logic as manual creation.

    Accepts multipart/form-data:
      - title: string (form field)
      - file: PDF file (file upload)
    """
    # Validate file type
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported. Please upload a .pdf file.",
        )

    # Validate content type
    content_type = file.content_type or ""
    if content_type and "pdf" not in content_type.lower():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Please upload a PDF.",
        )

    # Read file bytes
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 20MB max size
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum size is 20MB.",
        )

    # Extract text from PDF
    raw_text = extract_text_from_pdf(file_bytes)

    # Save syllabus
    syllabus = Syllabus(owner_email=email, title=title, raw_text=raw_text)
    session.add(syllabus)
    session.commit()
    session.refresh(syllabus)

    # Extract topics using existing logic
    extracted = simple_topic_extract(raw_text)
    for i, name in enumerate(extracted, start=1):
        session.add(Topic(syllabus_id=syllabus.id, name=name, order=i))
    session.commit()

    return {
        "syllabus_id": syllabus.id,
        "title": syllabus.title,
        "topics_count": len(extracted),
        "topics_preview": extracted[:10],
        "source": "pdf",
        "pdf_pages": raw_text.count("\n"),
        "raw_text_preview": raw_text[:300] + ("..." if len(raw_text) > 300 else ""),
    }


@router.post("/parse-pdf")
async def parse_pdf_only(
    file: UploadFile = File(...),
    email: str = Depends(get_current_email),
):
    """
    Parse a PDF and return the extracted text + topics WITHOUT saving to DB.
    Use this endpoint so the frontend can show the user a preview before saving.
    The user can then review/edit and call /create with the final text.
    """
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 20MB.")

    raw_text = extract_text_from_pdf(file_bytes)
    topics = simple_topic_extract(raw_text)

    return {
        "raw_text": raw_text,
        "topics_count": len(topics),
        "topics_preview": topics[:10],
        "topics": topics,
        "raw_text_preview": raw_text[:500] + ("..." if len(raw_text) > 500 else ""),
    }


@router.get("/mine")
def my_syllabi(
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(Syllabus)
        .where(Syllabus.owner_email == email)
        .order_by(Syllabus.id.desc())
    ).all()


@router.get("/{syllabus_id}")
def get_syllabus(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Not found")

    topics = session.exec(
        select(Topic)
        .where(Topic.syllabus_id == syllabus_id)
        .order_by(Topic.order)
    ).all()

    return {"syllabus": syllabus, "topics": topics}


class PlaylistSelectIn(BaseModel):
    playlist_url: str


@router.post("/{syllabus_id}/select-playlist")
def select_playlist(
    syllabus_id: int,
    data: PlaylistSelectIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    pid = extract_playlist_id(data.playlist_url)
    if not pid:
        raise HTTPException(status_code=400, detail="Invalid playlist URL (missing list=...)")

    existing = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).first()

    if existing:
        existing.playlist_id = pid
        existing.playlist_url = data.playlist_url
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return {"message": "Playlist updated", "syllabus_id": syllabus_id, "playlist_id": pid}

    sp = SyllabusPlaylist(syllabus_id=syllabus_id, playlist_id=pid, playlist_url=data.playlist_url)
    session.add(sp)
    session.commit()
    session.refresh(sp)

    return {"message": "Playlist saved", "syllabus_id": syllabus_id, "playlist_id": pid}


@router.get("/{syllabus_id}/playlist")
def get_saved_playlist(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    sp = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).first()

    if not sp:
        raise HTTPException(status_code=404, detail="No playlist selected for this syllabus")

    return sp


@router.get("/{syllabus_id}/playlist/videos")
async def get_saved_playlist_videos(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
    max_results: int = 50,
):
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    sp = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).first()

    if not sp:
        raise HTTPException(status_code=404, detail="No playlist selected for this syllabus")

    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not set in .env")

    max_results = max(1, min(max_results, 50))

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        "part": "snippet,contentDetails",
        "playlistId": sp.playlist_id,
        "maxResults": max_results,
        "key": settings.youtube_api_key,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            print("YOUTUBE ERROR:", r.status_code, r.text)
            raise HTTPException(
                status_code=502,
                detail=r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text,
            )
        js = r.json()

    videos = []
    for it in js.get("items", []):
        snip = it["snippet"]
        vid = snip["resourceId"]["videoId"]
        videos.append({
            "title": snip["title"],
            "videoId": vid,
            "position": snip.get("position"),
            "url": f"https://www.youtube.com/watch?v={vid}&list={sp.playlist_id}",
            "thumbnail": snip.get("thumbnails", {}).get("high", {}).get("url"),
        })

    videos.sort(key=lambda x: (x["position"] is None, x["position"]))

    return {
        "syllabus_id": syllabus_id,
        "playlist_id": sp.playlist_id,
        "count": len(videos),
        "videos": videos,
    }
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
from urllib.parse import urlparse, parse_qs
from sqlmodel import Session, select

from app.config import settings
from app.deps import get_current_email
from app.db import get_session
from app.models import Syllabus, SyllabusPlaylist

router = APIRouter()


# ---------- helpers ----------
def extract_playlist_id(url: str) -> str | None:
    """
    Supports:
    - https://www.youtube.com/playlist?list=PLxxxx
    - https://www.youtube.com/watch?v=VIDEO&list=PLxxxx
    - https://youtu.be/VIDEO?list=PLxxxx
    """
    try:
        parsed = urlparse(url.strip())
        qs = parse_qs(parsed.query)
        return qs.get("list", [None])[0]
    except Exception:
        return None


# ---------- request models ----------
class PlaylistOptionsIn(BaseModel):
    mode: str  # "url" or "search"
    playlist_url: str | None = None
    query: str | None = None
    max_results: int = 6


class SavePlaylistIn(BaseModel):
    syllabus_id: int
    playlist_id: str
    playlist_url: str | None = None


class RemovePlaylistIn(BaseModel):
    syllabus_id: int
    playlist_id: str


# ---------- endpoints ----------
@router.post("/playlist-options")
async def playlist_options(
    data: PlaylistOptionsIn,
    _: str = Depends(get_current_email),
):
    """
    Two options:
    1) mode="url": user provides playlist_url, we return it as one option
    2) mode="search": user provides query, we return top playlists from YouTube search
    """
    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not set in .env")

    mode = (data.mode or "").strip().lower()

    # --- option 1: user pasted a playlist URL ---
    if mode == "url":
        if not data.playlist_url:
            raise HTTPException(status_code=400, detail="playlist_url is required for mode='url'")

        pid = extract_playlist_id(data.playlist_url)
        if not pid:
            raise HTTPException(status_code=400, detail="Invalid playlist URL (missing list=...)")

        return {
            "mode": "url",
            "query": None,
            "results": [
                {
                    "playlistId": pid,
                    "title": "User provided playlist",
                    "channel": None,
                    "url": f"https://www.youtube.com/playlist?list={pid}",
                    "thumbnail": None,
                    "source": "user_url",
                }
            ],
        }

    # --- option 2: search playlists by topic ---
    if mode == "search":
        q = (data.query or "").strip()
        if not q:
            raise HTTPException(status_code=400, detail="query is required for mode='search'")

        max_results = max(1, min(data.max_results, 10))

        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": q,
            "type": "playlist",
            "maxResults": max_results,
            "key": settings.youtube_api_key,
            "safeSearch": "strict",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"YouTube API error: {r.text}")
            js = r.json()

        results = []
        for it in js.get("items", []):
            pid = it["id"]["playlistId"]
            snip = it["snippet"]
            results.append(
                {
                    "playlistId": pid,
                    "title": snip["title"],
                    "channel": snip["channelTitle"],
                    "url": f"https://www.youtube.com/playlist?list={pid}",
                    "thumbnail": snip.get("thumbnails", {}).get("high", {}).get("url"),
                    "source": "youtube_search",
                }
            )

        return {"mode": "search", "query": q, "results": results}

    raise HTTPException(status_code=400, detail="mode must be 'url' or 'search'")


@router.get("/playlists/{playlist_id}/videos")
async def playlist_videos(
    playlist_id: str,
    _: str = Depends(get_current_email),
    max_results: int = 50,
):
    """
    After user chooses a playlistId (from either mode), return its videos IN ORDER.
    """
    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not set in .env")

    max_results = max(1, min(max_results, 50))

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
            raise HTTPException(status_code=502, detail=f"YouTube API error: {r.text}")
        js = r.json()

    videos = []
    for it in js.get("items", []):
        snip = it["snippet"]
        vid = snip["resourceId"]["videoId"]
        videos.append(
            {
                "title": snip["title"],
                "videoId": vid,
                "position": snip.get("position"),
                "url": f"https://www.youtube.com/watch?v={vid}&list={playlist_id}",
                "thumbnail": snip.get("thumbnails", {}).get("high", {}).get("url"),
                "channel": snip.get("videoOwnerChannelTitle") or snip.get("channelTitle"),
            }
        )

    videos.sort(key=lambda x: (x["position"] is None, x["position"]))

    return {"playlistId": playlist_id, "count": len(videos), "videos": videos}


@router.post("/save-playlist")
def save_playlist(
    data: SavePlaylistIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    """
    Add a playlist to a syllabus.
    Multiple playlists are now supported per syllabus.
    Duplicate playlist_id for the same syllabus is silently ignored.
    """
    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    # Check if this exact playlist_id already exists for this syllabus
    existing = session.exec(
        select(SyllabusPlaylist).where(
            SyllabusPlaylist.syllabus_id == data.syllabus_id,
            SyllabusPlaylist.playlist_id == data.playlist_id,
        )
    ).first()

    if existing:
        return {
            "message": "Playlist already saved",
            "syllabus_id": existing.syllabus_id,
            "playlist_id": existing.playlist_id,
        }

    saved = SyllabusPlaylist(
        syllabus_id=data.syllabus_id,
        playlist_id=data.playlist_id,
        playlist_url=data.playlist_url or f"https://www.youtube.com/playlist?list={data.playlist_id}",
    )
    session.add(saved)
    session.commit()
    session.refresh(saved)

    return {
        "message": "Playlist saved successfully",
        "syllabus_id": saved.syllabus_id,
        "playlist_id": saved.playlist_id,
    }


@router.delete("/remove-playlist")
def remove_playlist(
    data: RemovePlaylistIn,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    """
    Remove a specific playlist from a syllabus.
    """
    syllabus = session.get(Syllabus, data.syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    existing = session.exec(
        select(SyllabusPlaylist).where(
            SyllabusPlaylist.syllabus_id == data.syllabus_id,
            SyllabusPlaylist.playlist_id == data.playlist_id,
        )
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="Playlist not found for this syllabus")

    session.delete(existing)
    session.commit()

    return {"message": "Playlist removed", "playlist_id": data.playlist_id}


@router.get("/saved-playlists/{syllabus_id}")
def get_saved_playlists(
    syllabus_id: int,
    email: str = Depends(get_current_email),
    session: Session = Depends(get_session),
):
    """
    Get ALL playlists saved for a syllabus.
    """
    syllabus = session.get(Syllabus, syllabus_id)
    if not syllabus or syllabus.owner_email != email:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    playlists = session.exec(
        select(SyllabusPlaylist).where(SyllabusPlaylist.syllabus_id == syllabus_id)
    ).all()

    return {
        "syllabus_id": syllabus_id,
        "count": len(playlists),
        "playlists": [
            {
                "playlist_id": p.playlist_id,
                "playlist_url": p.playlist_url,
                "created_at": p.created_at.isoformat(),
            }
            for p in playlists
        ],
    }
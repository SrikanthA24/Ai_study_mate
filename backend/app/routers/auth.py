from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from app.db import get_session
from app.models import User
from app.security import hash_password, verify_password, create_access_token

# ✅ DEFINE router FIRST
router = APIRouter()


class RegisterIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(data: RegisterIn, session: Session = Depends(get_session)):
    if len(data.password) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (max 72 characters)"
        )

    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=data.email, password_hash=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"id": user.id, "email": user.email}


@router.post("/login")
def login(data: LoginIn, session: Session = Depends(get_session)):
    if len(data.password) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (max 72 characters)"
        )

    user = session.exec(select(User).where(User.email == data.email)).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(sub=user.email)
    return {"access_token": token, "token_type": "bearer"}


from app.deps import get_current_email


@router.get("/me")
def me(email: str = Depends(get_current_email)):
    return {"email": email}
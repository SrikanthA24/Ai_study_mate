from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import create_db_and_tables, recreate_study_plan_tables
from app.routers import auth
from app.routers import syllabus
from app.routers import youtube
from app.routers import assessment
from app.routers import performance
from app.routers import recommendation
from app.routers import study_plan
from app.routers import study_plan_progress
from app.routers import progress
from app.routers import doubt_solver
from app.routers import srs


app = FastAPI(title="AI Study Mate Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    recreate_study_plan_tables()
    create_db_and_tables()

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(auth.router,                  prefix="/api/auth",                tags=["Auth"])
app.include_router(syllabus.router,              prefix="/api/syllabus",            tags=["Syllabus"])
app.include_router(youtube.router,               prefix="/api/youtube",             tags=["YouTube"])
app.include_router(assessment.router,            prefix="/api/assessment",          tags=["Assessment"])
app.include_router(performance.router,           prefix="/api/performance",         tags=["Performance"])
app.include_router(recommendation.router,        prefix="/api/recommendation",      tags=["Recommendation"])
app.include_router(study_plan.router,            prefix="/api/study-plan",          tags=["Study_Plan"])
app.include_router(
    study_plan_progress.router,
    prefix="/api/study-plan-progress",
    tags=["Study Plan Progress"],
)
app.include_router(progress.router,              prefix="/api/progress",            tags=["progress"])
app.include_router(doubt_solver.router,          prefix="/api/doubt-solver",        tags=["Doubt Solver"])
app.include_router(srs.router,                   prefix="/api/srs",                 tags=["SRS"])
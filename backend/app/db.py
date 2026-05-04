from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

engine = create_engine(settings.database_url, echo=False)


def create_db_and_tables() -> None:
    """
    Creates all tables if they do not already exist.
    Safe to call on every startup — never drops or wipes data.
    """
    SQLModel.metadata.create_all(engine)


def recreate_study_plan_tables() -> None:
    """
    Previously dropped and recreated study plan tables on every startup.
    Now this is a no-op — data is preserved across restarts.

    If you genuinely need to reset tables during development, run
    the manual reset script instead (scripts/reset_study_plans.py).
    """
    pass


def get_session():
    with Session(engine) as session:
        yield session
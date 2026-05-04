from typing import Optional, List
from datetime import datetime, date, timezone
from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Syllabus(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_email: str = Field(index=True)
    title: str
    raw_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    topics: List["Topic"] = Relationship(back_populates="syllabus")


class Topic(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    syllabus_id: int = Field(foreign_key="syllabus.id")
    name: str
    order: int = 0

    syllabus: Optional[Syllabus] = Relationship(back_populates="topics")


class SyllabusPlaylist(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    syllabus_id: int = Field(foreign_key="syllabus.id", index=True)
    playlist_id: str = Field(index=True)
    playlist_url: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VideoSummary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    syllabus_id: int = Field(index=True)
    video_id: str = Field(index=True)
    video_title: str
    transcript_text: str
    summary_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VideoAssessment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    syllabus_id: int = Field(index=True)
    video_id: str = Field(index=True)
    question: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    explanation: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AssessmentSubmission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True)
    video_id: str = Field(index=True)
    assessment_id: int = Field(index=True)
    selected_option: str
    is_correct: bool
    topic_name: Optional[str] = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow)


class TopicPerformance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True)
    topic_name: str = Field(index=True)

    total_questions: int = 0
    correct_answers: int = 0
    mastery_percentage: float = 0.0

    mastery_level: str = "unknown"   # weak / medium / strong / unknown
    needs_revision: bool = False
    last_score: float = 0.0
    revision_count: int = 0

    feedback: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StudyPlan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True, foreign_key="syllabus.id")
    title: str
    summary: str = ""
    end_date: date
    hours_per_day: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyPlanItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    study_plan_id: int = Field(index=True, foreign_key="studyplan.id")
    day_number: int
    plan_date: date
    topic: str
    task: str
    priority: str = "medium"
    estimated_hours: float = 1.0
    is_completed: bool = False

    video_id: Optional[str] = None
    video_title: Optional[str] = None
    video_url: Optional[str] = None


class DocumentChunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_email: str = Field(index=True)
    syllabus_id: int = Field(index=True)
    source_type: str = Field(index=True)  # syllabus / transcript / notes
    source_ref: str
    video_id: Optional[str] = Field(default=None, index=True)
    chunk_index: int = 0
    chunk_text: str
    metadata_json: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DoubtHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True)
    video_id: Optional[str] = Field(default=None, index=True)
    question: str
    answer: str
    answer_mode: str = "general_fallback"  # grounded / hybrid / general_fallback
    sources_json: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Spaced Repetition System (SRS) — SM-2 algorithm
# ---------------------------------------------------------------------------

class SRSCard(SQLModel, table=True):
    """
    One SRS card per (user, topic) pair.
    Tracks the SM-2 state for a single topic across all reviews.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True, foreign_key="syllabus.id")
    topic_name: str = Field(index=True)

    # SM-2 core fields
    srs_n: int = Field(default=0)            # consecutive successful reviews
    srs_ef: float = Field(default=2.5)       # easiness factor (min 1.3)
    srs_interval: int = Field(default=1)     # days until next review

    # Scheduling
    srs_next_review: date = Field(default_factory=date.today)
    last_reviewed_at: Optional[datetime] = None

    # Convenience stats (updated on every review)
    total_reviews: int = Field(default=0)
    total_correct: int = Field(default=0)    # quality >= 3

    created_at: datetime = Field(default_factory=datetime.utcnow)

    reviews: List["SRSReview"] = Relationship(back_populates="card")


class SRSReview(SQLModel, table=True):
    """
    One row per review session for a card.
    Full audit trail — useful for analytics and the research paper.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    card_id: int = Field(index=True, foreign_key="srscard.id")
    user_email: str = Field(index=True)
    syllabus_id: int = Field(index=True)

    quality: int                             # 0-5 rating given by the user
    ef_before: float                         # EF value before this review
    ef_after: float                          # EF value after this review
    interval_before: int                     # interval (days) before this review
    interval_after: int                      # interval (days) after this review
    n_before: int                            # repetition count before
    n_after: int                             # repetition count after

    reviewed_at: datetime = Field(default_factory=datetime.utcnow)

    card: Optional[SRSCard] = Relationship(back_populates="reviews")
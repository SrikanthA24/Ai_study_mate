from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    # -------------------------
    # Database
    # -------------------------
    database_url: str

    # -------------------------
    # JWT Authentication
    # -------------------------
    jwt_secret: str
    jwt_expire_minutes: int = 10080

    # -------------------------
    # YouTube API
    # -------------------------
    youtube_api_key: Optional[str] = None

    # -------------------------
    # OpenAI
    # -------------------------
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    # -------------------------
    # Groq
    # -------------------------
    groq_api_key: Optional[str] = None
    groq_model: str = "llama-3.3-70b-versatile"

    # -------------------------
    # Environment file
    # -------------------------
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
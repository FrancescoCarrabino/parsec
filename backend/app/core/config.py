# parsec-backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """
    Manages application-wide settings, reading from environment variables.
    """

    model_config = SettingsConfigDict(extra="ignore")

    # --- Application Settings ---
    PROJECT_NAME: str = "Parsec"
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = "http://localhost:5173"

    # --- TEXT MODEL SETTINGS ---
    LITELLM_TEXT_MODEL: str
    AZURE_API_KEY_TEXT: str
    AZURE_API_BASE_TEXT: str
    AZURE_API_VERSION_TEXT: str

    # --- IMAGE MODEL SETTINGS ---
    LITELLM_IMAGE_MODEL: str
    AZURE_API_KEY_DALLE: str
    AZURE_API_BASE_DALLE: str
    AZURE_API_VERSION_DALLE: str

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minio"
    MINIO_SECRET_KEY: str = "minio123"
    MINIO_BUCKET_NAME: str = "parsec-assets"
    MINIO_USE_SECURE: bool = False
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"

    BACKEND_BASE_URL: str = "http://localhost:8000"

    # --- Logging Settings ---
    LOG_LEVEL: str = "INFO"
    LOG_AS_JSON: bool = False


# Global settings instance
settings = Settings()

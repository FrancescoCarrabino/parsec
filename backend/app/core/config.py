from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union
from dotenv import load_dotenv

# This is the fix. We load the .env file here, right before the Settings
# class is defined. This guarantees that the environment variables are
# available at the moment Pydantic needs them.
load_dotenv()


class Settings(BaseSettings):
    """
    Manages application-wide settings.
    It automatically reads from environment variables, which are pre-loaded
    by the load_dotenv() call in this same module.
    """

    # We keep extra='ignore' for LiteLLM provider keys that we don't
    # explicitly define as fields below (e.g., AZURE_API_KEY).
    model_config = SettingsConfigDict(extra="ignore")

    # --- Application Settings ---
    PROJECT_NAME: str = "Parsec"
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = "http://localhost:5173"

    # --- LiteLLM Model Setting ---
    LITELLM_MODEL: str

    # --- Logging Settings ---
    LOG_LEVEL: str = "INFO"
    LOG_AS_JSON: bool = False


# Global settings instance, to be used throughout the application.
settings = Settings()

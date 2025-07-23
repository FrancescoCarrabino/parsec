# backend/app/main.py (Final, Corrected Version)
from fastapi import FastAPI
from contextlib import asynccontextmanager
import litellm
from loguru import logger
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api.v1 import websocket
from .api.v1 import assets


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup: Configuring LiteLLM with direct model lookup...")

    # The key for the lookup ('model_name') MUST be the full model string from settings.
    # This allows LiteLLM to find the credentials for the exact model string we pass in our calls.
    # We trust that settings.LITELLM_TEXT_MODEL already contains the 'azure/' prefix, as you stated.
    model_configurations = [
        {
            "model_name": settings.LITELLM_TEXT_MODEL,
            "litellm_params": {
                "model": settings.LITELLM_TEXT_MODEL,
                "api_key": settings.AZURE_API_KEY_TEXT,
                "api_base": settings.AZURE_API_BASE_TEXT,
                "api_version": settings.AZURE_API_VERSION_TEXT,
            },
        },
        {
            "model_name": settings.LITELLM_IMAGE_MODEL,
            "litellm_params": {
                "model": settings.LITELLM_IMAGE_MODEL,
                "api_key": settings.AZURE_API_KEY_DALLE,
                "api_base": settings.AZURE_API_BASE_DALLE,
                "api_version": settings.AZURE_API_VERSION_DALLE,
            },
        },
    ]

    litellm.model_list = model_configurations
    litellm.set_verbose = False

    logger.success(
        f"LiteLLM configured successfully for models: {[m['model_name'] for m in litellm.model_list]}"
    )

    yield
    logger.info("Application shutdown.")


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins="*",
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)


app.include_router(websocket.router, prefix="/api/v1")
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Assets"])


@app.get("/")
async def root():
    return {"message": "Parsec is running."}

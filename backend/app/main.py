# parsec-backend/app/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
import litellm

from .core.config import settings
from .api.v1 import websocket

# =============================================================================
# NEW: Lifespan Management for Application Startup
# This is the modern way in FastAPI to run code on startup and shutdown.
# =============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Code to run on startup ---
    print("INFO:     Application startup: Configuring LiteLLM...")

    # Set credentials for Azure text models
    litellm.api_key = settings.AZURE_API_KEY_TEXT
    litellm.api_base = settings.AZURE_API_BASE_TEXT
    litellm.api_version = settings.AZURE_API_VERSION_TEXT
    
    # We can also pre-configure image models if needed, using custom_llm_provider
    # For now, we will focus on fixing the text model calls.
    
    print("INFO:     LiteLLM configured successfully.")
    
    yield
    
    # --- Code to run on shutdown (if any) ---
    print("INFO:     Application shutdown.")

# =============================================================================

# Create the main FastAPI app instance, attaching the lifespan manager
app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Include the WebSocket router
app.include_router(websocket.router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Parsec is running."}
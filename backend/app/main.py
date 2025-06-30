from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging_config import setup_logging  # <-- Import
from .api.v1 import websocket

# Call the setup function here, before creating the app instance
setup_logging()

app = FastAPI(title=settings.PROJECT_NAME)

# CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    origins = []
    # Handle space-separated string from .env
    if isinstance(
        settings.BACKEND_CORS_ORIGINS, str
    ) and not settings.BACKEND_CORS_ORIGINS.startswith("["):
        origins.extend(
            [item.strip() for item in settings.BACKEND_CORS_ORIGINS.split(" ")]
        )
    else:
        origins = settings.BACKEND_CORS_ORIGINS

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include API routers
app.include_router(websocket.router, prefix="/api/v1")

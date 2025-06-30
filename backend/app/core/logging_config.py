# parsec-backend/app/core/logging_config.py
import sys
import json
from loguru import logger
from .config import settings


def setup_logging():
    """
    Configures the Loguru logger for the application.

    This setup removes the default handler, and adds a new one that can
    log in either plain text (for development) or JSON (for production),
    based on the LOG_AS_JSON environment variable.
    """
    # Remove the default handler to prevent duplicate logs.
    logger.remove()

    # The 'sink' is the destination for logs (e.g., stdout, file).
    # We use sys.stdout to log to the console.
    sink = sys.stdout

    # The log format. In non-JSON mode, this provides a readable, colored output.
    # In JSON mode, this format is ignored in favor of a structured record.
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    )

    if settings.LOG_AS_JSON:
        # If logging as JSON, define a custom formatter function.
        def json_formatter(record):
            log_object = {
                "timestamp": record["time"].isoformat(),
                "level": record["level"].name,
                "message": record["message"],
                "source": {
                    "name": record["name"],
                    "function": record["function"],
                    "line": record["line"],
                },
                # Add any extra data to the log object
                **record["extra"],
            }
            # Use json.dumps to ensure the output is a valid JSON string.
            # 'ensure_ascii=False' is good practice for international characters.
            sink.write(json.dumps(log_object, ensure_ascii=False) + "\n")

        logger.add(
            sink=json_formatter,
            level=settings.LOG_LEVEL.upper(),
            enqueue=True,  # Make logging non-blocking
        )
    else:
        # For standard development logging (human-readable).
        logger.add(
            sink=sink,
            level=settings.LOG_LEVEL.upper(),
            format=log_format,
            colorize=True,
            enqueue=True,
        )

    logger.info("Logging configured successfully.")

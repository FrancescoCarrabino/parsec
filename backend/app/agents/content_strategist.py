# parsec-backend/app/agents/content_strategist.py
import json
import litellm
from typing import List, Dict, Any, Optional

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent

class ContentStrategist(BaseAgent):
    """
    A specialist agent for generating structured text content and knowledge.
    It does not use any canvas tools.
    """
    def __init__(self, **kwargs):
        # This calls the parent constructor, providing its unique name.
        super().__init__(agent_name="ContentStrategist", **kwargs)

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> Any:
        """
        Takes a prompt and returns structured data (typically JSON).
        For this agent, the return value is not a command, but data for another agent.
        """
        logger.info(f"ContentStrategist received task: '{prompt}'")

        system_prompt = (
            "You are a world-class research assistant and content strategist. Your task is to take a user's topic "
            "and generate a structured, factual, and concise outline. Respond ONLY with a valid JSON object or array as requested."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        try:
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL,
                messages=messages,
                response_format={"type": "json_object"} # Force JSON output
            )
            content = response.choices[0].message.content
            logger.success("ContentStrategist successfully generated structured content.")
            # Parse the JSON string into a Python object before returning
            return json.loads(content)
        except Exception:
            logger.exception("ContentStrategist failed to generate content.")
            return None
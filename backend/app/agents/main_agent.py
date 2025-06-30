import litellm
from typing import List, Dict, Any, Optional
from loguru import logger

from ..core.config import settings
from .canvas_agent import CanvasAgent


class MainAgent:
    """
    The main dispatcher agent. It analyzes the user's prompt and routes it
    to the appropriate specialist agent (e.g., CanvasAgent).
    """

    def __init__(self, canvas_agent: CanvasAgent):
        self.canvas_agent = canvas_agent
        logger.info("MainAgent dispatcher initialized.")

    async def process_prompt(
        self, prompt_text: str, selected_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        1. Classify the user's intent.
        2. Route the prompt and its context (like selected IDs) to the correct specialist agent.
        """
        logger.info(
            f"MainAgent received prompt: '{prompt_text}' with selection context: {selected_ids}"
        )

        # The context of the selection is now part of the user's request for classification
        contextual_prompt = prompt_text
        if selected_ids:
            contextual_prompt += f" (context: the user has these elements selected: {', '.join(selected_ids)})"

        system_prompt = (
            "You are a routing agent. Your job is to classify the user's request "
            "and determine which specialist is best suited to handle it. "
            "If the request mentions elements, arrangement, design, or the canvas, the intent is 'canvas'. "
            "You must respond with only one of the following keywords: 'canvas', 'code', or 'chat'."
        )

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Classify the following user request: '{contextual_prompt}'",
            },
        ]

        try:
            response = await litellm.acompletion(
                model=settings.LITELLM_MODEL,
                messages=messages,
                max_tokens=10,
            )

            intent_raw = response.choices[0].message.content or ""
            intent = intent_raw.lower().strip().replace("'", "").replace('"', "")
            logger.info(f"Classified intent as: '{intent}'")

            # The specialist also needs the full context.
            specialist_messages: List[Dict[str, Any]] = [
                {"role": "user", "content": contextual_prompt}
            ]

            if "canvas" in intent:
                return await self.canvas_agent.process_prompt(
                    contextual_prompt, specialist_messages, model=settings.LITELLM_MODEL
                )
            else:
                logger.warning(
                    f"Could not clearly classify intent '{intent}'. Defaulting to CanvasAgent."
                )
                return await self.canvas_agent.process_prompt(
                    contextual_prompt, specialist_messages, model=settings.LITELLM_MODEL
                )

        except Exception:
            logger.exception("An error occurred in the MainAgent dispatcher.")
            return []

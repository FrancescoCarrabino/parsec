# parsec-backend/app/agents/main_agent.py
import litellm
from typing import List, Dict, Any, Optional
from loguru import logger

from ..core.config import settings
from .canvas_agent import CanvasAgent
from .image_genius import ImageGenius

class MainAgent:
    """
    The main dispatcher agent. It analyzes the user's prompt and routes it
    to the appropriate specialist agent (e.g., CanvasAgent, ImageGenius).
    """

    def __init__(self, canvas_agent: CanvasAgent, image_agent: ImageGenius):
        self.canvas_agent = canvas_agent
        self.image_agent = image_agent
        logger.info("MainAgent dispatcher initialized with [CanvasAgent, ImageGenius].")

    async def process_prompt(
        self, prompt_text: str, selected_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        1. Classify the user's intent with higher fidelity.
        2. Route the prompt and its context to the correct specialist agent.
        """
        logger.info(
            f"MainAgent received prompt: '{prompt_text}' with selection context: {selected_ids}"
        )

        contextual_prompt = prompt_text
        if selected_ids:
            contextual_prompt += f" (context: the user has these elements selected: {', '.join(selected_ids)})"

        system_prompt = (
            "You are an expert routing agent. Your job is to classify the user's request "
            "and determine which specialist is best suited to handle it. You must respond "
            "with only ONE of the following keywords: 'image', 'canvas', or 'chat'.\n"
            "- If the request is to generate, create, or make a picture, photo, drawing, or image, the intent is 'image'.\n"
            "- If the request involves manipulating existing elements, arranging layout, changing colors, adding shapes, or anything else related to the design canvas, the intent is 'canvas'.\n"
            "- For anything else, the intent is 'chat'."
        )

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Classify this user request: '{contextual_prompt}'",
            },
        ]

        try:
            # --- Use the TEXT model for classification ---
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL,
                messages=messages,
                max_tokens=10,
                temperature=0.0,
                api_key=settings.AZURE_API_KEY_TEXT,
                api_base=settings.AZURE_API_BASE_TEXT,
                api_version=settings.AZURE_API_VERSION_TEXT
            )

            intent_raw = response.choices[0].message.content or ""
            intent = intent_raw.lower().strip().replace("'", "").replace('"', "")
            logger.info(f"Classified intent as: '{intent}'")

            if "image" in intent:
                command = await self.image_agent.generate_and_place_image(prompt_text)
                return [command]
            
            elif "canvas" in intent:
                specialist_messages: List[Dict[str, Any]] = [
                    {"role": "user", "content": contextual_prompt}
                ]
                # --- Pass the TEXT model to the CanvasAgent ---
                return await self.canvas_agent.process_prompt(
                    contextual_prompt, specialist_messages, model=settings.LITELLM_TEXT_MODEL
                )

            else:
                logger.warning(f"Intent '{intent}' not handled. No action taken.")
                return []

        except Exception:
            logger.exception("An error occurred in the MainAgent dispatcher.")
            return []
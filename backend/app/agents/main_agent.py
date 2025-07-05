# parsec-backend/app/agents/main_agent.py
import litellm
from typing import List, Dict, Any, Optional
from loguru import logger

from ..core.config import settings
from .canvas_agent import CanvasAgent
from .image_genius import ImageGenius
from .layout_maestro import LayoutMaestro
from .component_crafter import ComponentCrafter

class MainAgent:
    """
    The main dispatcher agent. It analyzes the user's prompt and routes it
    to the appropriate specialist agent.
    """

    def __init__(
        self,
        canvas_agent: CanvasAgent,
        image_agent: ImageGenius,
        layout_agent: LayoutMaestro,
        component_agent: ComponentCrafter,
    ):
        self.canvas_agent = canvas_agent
        self.image_agent = image_agent
        self.layout_agent = layout_agent
        self.component_agent = component_agent
        self.last_touched_ids: List[str] = []
        logger.info("MainAgent dispatcher initialized with [CanvasAgent, ImageGenius, LayoutMaestro, ComponentCrafter].")

    def _is_ambiguous_prompt(self, prompt: str) -> bool:
        prompt = prompt.lower()
        if len(prompt.split()) < 5:
            if any(p in prompt for p in ["it", "its", "they", "them", "their", "bigger", "smaller", "make it"]):
                return True
        return False

    async def process_prompt(
        self, prompt_text: str, selected_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        logger.info(f"MainAgent received prompt: '{prompt_text}' with selection context: {selected_ids}")

        contextual_prompt = prompt_text
        if not selected_ids and self._is_ambiguous_prompt(prompt_text) and self.last_touched_ids:
            logger.info(f"Ambiguous prompt detected. Injecting memory context: {self.last_touched_ids}")
            selected_ids = self.last_touched_ids
            contextual_prompt += f" (referring to element(s): {', '.join(self.last_touched_ids)})"
        
        if selected_ids and "context" not in contextual_prompt and "referring to" not in contextual_prompt:
             contextual_prompt += f" (context: the user has these elements selected: {', '.join(selected_ids)})"

        system_prompt = (
            "You are an expert routing agent. Your job is to classify the user's request and determine which specialist is best suited to handle it.\n\n"
            "Here are the categories:\n"
            "- 'component': For requests to create a reusable component, template, or symbol from existing elements.\n"
            "- 'layout': For requests involving arranging, aligning, distributing, centering, or tidying up elements.\n"
            "- 'image': For requests to generate, create, or make a picture, photo, or image.\n"
            "- 'canvas': For requests to create NEW elements like shapes or text, or to modify non-positional properties like color, size, or content.\n"
            "- 'chat': For all other requests, like questions or greetings.\n\n"
            "You MUST respond with only ONE of the single-word keywords: 'component', 'layout', 'image', 'canvas', or 'chat'."
        )

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Classify this user request: 'turn this into a component called MyButton'"},
            {"role": "assistant", "content": "component"},
            {"role": "user", "content": "Classify this user request: 'put these in a straight line'"},
            {"role": "assistant", "content": "layout"},
            {"role": "user", "content": f"Classify this user request: '{contextual_prompt}'"},
        ]

        try:
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL, 
                messages=messages, 
                max_tokens=10, 
                temperature=0.0
            )

            intent_raw = response.choices[0].message.content or ""
            intent = ''.join(c for c in intent_raw if c.isalpha()).lower()
            logger.info(f"LLM raw response: '{intent_raw}'. Parsed intent: '{intent}'")
            
            commands: List[Dict[str, Any]] = []
            affected_ids: List[str] = []

            if intent == "component":
                commands = await self.component_agent.process_component_request(prompt_text, selected_ids or [])
                affected_ids = [] 
            elif intent == "layout":
                commands, affected_ids = await self.layout_agent.process_layout_request(prompt_text, selected_ids)
            elif intent == "image":
                command, affected_ids = await self.image_agent.generate_and_place_image(prompt_text)
                commands = [command] if command else []

            # --- THIS IS THE FIX ---
            elif intent == "canvas":
                # The CanvasAgent requires its own `messages` list for its internal reasoning.
                # We must construct it here and pass it along.
                specialist_messages: List[Dict[str, Any]] = [{"role": "user", "content": contextual_prompt}]
                commands, affected_ids = await self.canvas_agent.process_prompt(
                    contextual_prompt, specialist_messages, model=settings.LITELLM_TEXT_MODEL
                )
            # --- END OF FIX ---

            else:
                logger.warning(f"Intent '{intent}' not handled or classified as chat.")
                self.last_touched_ids = []
                return []

            if affected_ids:
                logger.info(f"Updating conversational memory with affected IDs: {affected_ids}")
                self.last_touched_ids = affected_ids
            
            return commands

        except Exception:
            logger.exception("An error occurred in the MainAgent dispatcher.")
            self.last_touched_ids = []
            return []
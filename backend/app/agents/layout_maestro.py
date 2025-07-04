# parsec-backend/app/agents/layout_maestro.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional, Tuple

from loguru import logger
from ..core.config import settings
from .shared_tools import CommonCanvasTools, GET_CANVAS_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL

class LayoutMaestro:
    """A specialist agent for all intelligent layout, alignment, and distribution tasks."""

    def __init__(self, common_tools: CommonCanvasTools):
        self.common_tools = common_tools
        self.tools: List[Dict[str, Any]] = [GET_CANVAS_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL]
        self.available_functions: Dict[str, Callable] = {
            "get_canvas_elements": self.common_tools.get_canvas_elements,
            "update_elements": self.common_tools.update_elements,
        }
        logger.info("LayoutMaestro specialist initialized.")

    async def process_layout_request(
        self, prompt_text: str, selected_ids: Optional[List[str]] = None
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Processes a layout command and returns commands and affected IDs.
        """
        logger.info(f"LayoutMaestro received prompt: '{prompt_text}' for elements: {selected_ids}")
        if not selected_ids: return [], []

        system_prompt = (
            "You are a world-class graphic designer... (prompt unchanged)"
        )
        contextual_prompt = f"User Request: '{prompt_text}'. The user has the following elements selected: {json.dumps(selected_ids)}. Please perform the requested layout operation on them."
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": contextual_prompt}
        ]

        try:
            for _ in range(5):
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=full_messages, tools=self.tools, tool_choice="auto",
                    api_key=settings.AZURE_API_KEY_TEXT, api_base=settings.AZURE_API_BASE_TEXT,
                    api_version=settings.AZURE_API_VERSION_TEXT
                )
                response_message = response.choices[0].message
                full_messages.append(response_message)
                if not response_message.tool_calls: break

                final_commands = []
                all_affected_ids = []

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = self.available_functions.get(function_name)
                    if not function_to_call: continue

                    function_args = json.loads(tool_call.function.arguments)
                    
                    if function_name == "get_canvas_elements":
                        tool_output = function_to_call(**function_args)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps(tool_output)})
                    else:
                        command, affected_ids = function_to_call(**function_args)
                        final_commands.append(command)
                        all_affected_ids.extend(affected_ids)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success"})})

                if final_commands:
                    logger.success(f"LayoutMaestro concluded with {len(final_commands)} command(s) affecting IDs: {all_affected_ids}.")
                    return final_commands, all_affected_ids
            
            return [], []
        except Exception:
            logger.exception("An error occurred in the LayoutMaestro's reasoning loop.")
            return [], []
# parsec-backend/app/agents/layout_maestro.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional, Tuple

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CommonCanvasTools, GET_CANVAS_ELEMENTS_TOOL, GET_ELEMENTS_BY_ID_TOOL, UPDATE_ELEMENTS_TOOL

class LayoutMaestro(BaseAgent):
    """
    A specialist agent for all intelligent layout, alignment, and distribution of EXISTING elements.
    """
    def __init__(self, **kwargs):
        # Call the parent constructor with its name and dependencies
        super().__init__(agent_name="LayoutMaestro", **kwargs)
        
        # Define the specific tools this agent needs to arrange elements.
        self.tools: List[Dict[str, Any]] = [
            GET_CANVAS_ELEMENTS_TOOL,
            GET_ELEMENTS_BY_ID_TOOL,
            UPDATE_ELEMENTS_TOOL
        ]
        self.available_functions: Dict[str, Callable] = {
            "get_canvas_elements": self.common_tools.get_canvas_elements,
            "get_elements_by_id": self.common_tools.get_elements_by_id,
            "update_elements": self.common_tools.update_elements,
        }

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        The primary entry point for the LayoutMaestro. It takes a layout request and
        calculates the necessary updates to position elements.
        """
        context = context or {}
        selected_ids = context.get("selected_ids")
        logger.info(f"LayoutMaestro received task: '{prompt}' with context: {context}")

        if not selected_ids:
            logger.warning("LayoutMaestro requires selected elements to arrange. Aborting.")
            # Optionally, we could make this an error message returned to the user.
            return []

        system_prompt = (
            "You are 'Layout Maestro', a world-class graphic designer specializing in the precise arrangement of elements. "
            "Your task is to take a user's request (e.g., 'align these to the left', 'distribute vertically') and a set of selected element IDs, "
            "and translate that into a single `update_elements` tool call that modifies their x/y coordinates to achieve the desired layout. "
            "You must first use `get_elements_by_id` to understand the current positions and dimensions of the elements you are working with. "
            "Your final action must be a call to `update_elements`."
        )
        
        contextual_prompt = f"User Request: '{prompt}'. The user has the following elements selected: {json.dumps(selected_ids)}. Please perform the requested layout operation on them."
        
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": contextual_prompt}
        ]

        try:
            # Standard tool-use loop
            for _ in range(5):
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=full_messages, tools=self.tools, tool_choice="auto"
                )
                response_message = response.choices[0].message
                full_messages.append(response_message)

                if not response_message.tool_calls:
                    break # Task is complete

                final_commands = []
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = self.available_functions.get(function_name)
                    if not function_to_call: continue

                    function_args = json.loads(tool_call.function.arguments)
                    
                    if function_name in ["get_canvas_elements", "get_elements_by_id"]:
                        tool_output = function_to_call(**function_args)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps(tool_output)})
                    else: # update_elements
                        command, affected_ids = function_to_call(**function_args)
                        if command:
                            final_commands.append(command)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success", "affected_ids": affected_ids})})

                # The layout task should ideally conclude in a single `update_elements` call.
                if final_commands:
                    logger.success(f"LayoutMaestro concluded with {len(final_commands)} command(s).")
                    return final_commands
            
            return []
        except Exception:
            logger.exception("An error occurred in the LayoutMaestro's reasoning loop.")
            return []
# parsec-backend/app/agents/canvas_agent.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CommonCanvasTools, GET_CANVAS_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL, CREATE_ELEMENTS_TOOL

class CanvasAgent(BaseAgent):
    """
    A specialist agent for direct modifications to existing elements and creation of simple, single elements.
    Handles tasks like 'make this red', 'change the text to "hello"', or 'create a circle'.
    """
    def __init__(self, **kwargs):
        # Call the parent constructor with its name and dependencies
        super().__init__(agent_name="CanvasAgent", **kwargs)
        
        # Define the specific tools this agent prefers to use.
        self.tools: List[Dict[str, Any]] = [
            UPDATE_ELEMENTS_TOOL,
            CREATE_ELEMENTS_TOOL, # For creating single, simple shapes/text
            GET_CANVAS_ELEMENTS_TOOL,
        ]
        self.available_functions: Dict[str, Callable] = {
            "update_elements": self.common_tools.update_elements,
            "create_elements": self.common_tools.create_elements,
            "get_canvas_elements": self.common_tools.get_canvas_elements,
        }

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        The primary entry point for the CanvasAgent. It receives a task and uses its
        tools to execute modifications on the canvas.
        """
        context = context or {}
        selected_ids = context.get("selected_ids")
        logger.info(f"CanvasAgent received task: '{prompt}' with context: {context}")

        system_prompt = (
            "You are a precise and efficient design assistant. Your role is to directly modify properties of existing elements on a canvas or create single, simple new elements as requested. "
            "You MUST use the provided tools to accomplish the task. "
            "If the user wants to change something, you should first use `get_canvas_elements` if you don't have enough context, then call `update_elements` with the specific changes. "
            "If the user asks to create a simple item like 'a red square', use the `create_elements` tool."
        )

        # Build the contextual prompt for the LLM
        contextual_prompt = prompt
        if selected_ids:
            contextual_prompt += f" (The user has these elements selected: {selected_ids})"
        
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": contextual_prompt}
        ]

        try:
            # Standard tool-use loop
            for _ in range(5):
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=full_messages, tools=self.tools, tool_choice="auto",
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
                    
                    # Handle both informational and action tools
                    if function_name == "get_canvas_elements":
                        tool_output = function_to_call(**function_args)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps(tool_output)})
                    else: # update_elements or create_elements
                        command, affected_ids = function_to_call(**function_args)
                        if command:
                            final_commands.append(command)
                        # We don't need to add affected_ids to memory here, as MainAgent handles that.
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success", "affected_ids": affected_ids})})
                
                # In this agent, we usually expect a single action, so we can return early.
                if final_commands:
                    logger.success(f"CanvasAgent concluded with {len(final_commands)} command(s).")
                    return final_commands
            
            return []
        except Exception:
            logger.exception("An error occurred in the CanvasAgent's reasoning loop.")
            return []
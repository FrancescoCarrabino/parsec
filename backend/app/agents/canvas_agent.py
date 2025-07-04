# parsec-backend/app/agents/canvas_agent.py
import json
import litellm
from typing import List, Dict, Callable, Any, Tuple

from loguru import logger
from ..services.workspace_service import WorkspaceService
from ..core.config import settings
from .shared_tools import CommonCanvasTools, GET_CANVAS_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL

class CanvasAgent:
    """A specialist agent for creating new shapes, paths, and text on the canvas."""

    def __init__(self, workspace_service: WorkspaceService, common_tools: CommonCanvasTools):
        self.workspace = workspace_service
        self.common_tools = common_tools
        self.specialist_tools: List[Dict[str, Any]] = [
            # ... (omitting tool definitions for brevity, they are unchanged)
            { "type": "function", "function": { "name": "create_shape", "description": "Creates a new shape (rectangle or circle) on the canvas.", "parameters": { "type": "object", "properties": { "shape_type": { "type": "string", "enum": ["rect", "circle"],}, "x": {"type": "number"}, "y": {"type": "number"}, "fill": {"type": "string"}, "width": {"type": "number"}, "height": {"type": "number"}, }, "required": ["shape_type", "x", "y", "fill"], }, }, }
        ]
        self.tools: List[Dict[str, Any]] = self.specialist_tools + [GET_CANVAS_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL]
        self.available_functions: Dict[str, Callable] = {
            "create_shape": self.create_shape,
            "get_canvas_elements": self.common_tools.get_canvas_elements,
            "update_elements": self.common_tools.update_elements,
        }
        logger.info("CanvasAgent specialist initialized.")

    def create_shape(self, **kwargs) -> Tuple[Dict[str, Any], List[str]]:
        """
        Creates a shape element and returns the command and its ID.
        """
        logger.info(f"Executing tool 'create_shape' with args: {kwargs}")
        if "fill" in kwargs and isinstance(kwargs["fill"], str):
            kwargs["fill"] = {"type": "solid", "color": kwargs["fill"]}
        
        new_element = self.workspace.create_element_from_payload({"element_type": "shape", **kwargs})
        
        if new_element:
            command = {"type": "element_created", "payload": new_element.model_dump()}
            return command, [new_element.id] # Return command and the new ID
        
        return {}, [] # Return empty if creation fails

    async def process_prompt(
        self, prompt_text: str, messages: List[Dict[str, Any]], model: str
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Processes a prompt and returns a list of commands and a list of affected IDs.
        """
        logger.info(f"CanvasAgent is now handling the request with model '{model}'.")
        system_prompt = (
            "You are a precise design assistant... (prompt unchanged)"
        )
        full_messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}] + messages

        try:
            for _ in range(5):
                response = await litellm.acompletion(
                    model=model, messages=full_messages, tools=self.tools, tool_choice="auto",
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
                        # Action tools now return a tuple: (command, affected_ids)
                        command, affected_ids = function_to_call(**function_args)
                        final_commands.append(command)
                        all_affected_ids.extend(affected_ids)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success"})})

                if final_commands:
                    logger.success(f"CanvasAgent concluded with {len(final_commands)} command(s) affecting IDs: {all_affected_ids}.")
                    return final_commands, all_affected_ids
            
            return [], []
        except Exception:
            logger.exception("An error occurred in the CanvasAgent's reasoning loop.")
            return [], []
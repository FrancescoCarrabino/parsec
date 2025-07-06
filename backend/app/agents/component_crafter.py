# parsec-backend/app/agents/component_crafter.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CommonCanvasTools, GET_ELEMENTS_BY_ID_TOOL
from ..services.workspace_service import WorkspaceService 

class ComponentCrafter(BaseAgent):
    """
    A specialist agent for creating reusable components from a selection of existing elements.
    """
    def __init__(self, workspace_service: WorkspaceService, **kwargs):
        super().__init__(agent_name="ComponentCrafter", **kwargs)
        self.workspace_service = workspace_service # This agent needs direct workspace access for the final creation step
        self.tools = self._get_tools()
        self.available_functions: Dict[str, Callable] = {
            "get_elements_by_id": self.common_tools.get_elements_by_id,
            "define_component_from_elements": self._define_component_from_elements,
            "request_user_input": self._request_user_input
        }
    
    def _get_tools(self) -> List[Dict[str, Any]]:
        """Defines all tools available to this agent."""
        return [
            GET_ELEMENTS_BY_ID_TOOL,
            {
                "type": "function",
                "function": {
                    "name": "define_component_from_elements",
                    "description": "The final action to create a component definition from a list of element IDs, a name, and a schema.",
                    "parameters": { "type": "object", "properties": {
                            "name": {"type": "string", "description": "The desired name for the new component."},
                            "element_ids": {"type": "array", "items": {"type": "string"}},
                            "schema": { "type": "array", "items": {"type": "object"}, "description": "A list of property definitions that you have intelligently generated."}
                        }, "required": ["name", "element_ids", "schema"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "request_user_input",
                    "description": "Ask the user for more information when the component name is missing from the prompt.",
                    "parameters": { "type": "object", "properties": { "query": {"type": "string"}}, "required": ["query"], },
                },
            },
        ]
    
    def _define_component_from_elements(self, name: str, element_ids: List[str], schema: List[Dict]) -> List[Dict[str, Any]]:
        """Internal tool implementation that calls the workspace service."""
        definition, instance, deleted_ids = self.workspace_service.create_component_from_elements(
            name=name, source_element_ids=element_ids, schema=schema
        )
        if definition and instance:
            commands = [
                {"type": "COMPONENT_DEFINITION_CREATED", "payload": definition.model_dump()},
                {"type": "ELEMENT_CREATED", "payload": instance.model_dump()}
            ]
            commands.extend([{"type": "ELEMENT_DELETED", "payload": {"id": del_id}} for del_id in deleted_ids])
            return commands
        return [{"type": "error", "payload": {"message": "Failed to create the component in the workspace."}}]

    def _request_user_input(self, query: str) -> List[Dict[str, Any]]:
        """Internal tool implementation that returns a request for user input."""
        return [{"type": "REQUEST_USER_INPUT", "payload": {"query": query}}]

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Handles the multi-step conversation to intelligently create a component.
        """
        context = context or {}
        selected_element_ids = context.get("selected_ids")
        logger.info(f"ComponentCrafter received task: '{prompt}' with context: {context}")

        if not selected_element_ids:
            return [{"type": "error", "payload": {"message": "Please select one or more elements to create a component."}}]

        system_prompt = """
You are a specialist agent called 'ComponentCrafter'. Your sole purpose is to help a user create a reusable 'Component' from a selection of existing elements on a design canvas.
You operate in a strict, multi-step process:
1.  **Get Name**: First, determine the desired name for the component from the user's prompt. If the user doesn't provide one, you MUST ask them for one by calling the `request_user_input` tool. Do not proceed without a name.
2.  **Inspect Elements**: Once you have the name, you MUST call the `get_elements_by_id` tool, providing the list of element IDs the user has selected. This is CRUCIAL for you to understand what you are working with.
3.  **Analyze and Define Schema**: After you receive the element data, analyze it to create a `schema` of editable properties (e.g., for text content, shape fills, etc.).
4.  **Create Component**: As your FINAL action, you MUST call the `define_component_from_elements` tool.
"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"User Prompt: '{prompt}'.\nSelected element IDs: {selected_element_ids}"}
        ]
        
        for _ in range(3): # Max 3 turns for the conversation
            try:
                response = await litellm.acompletion(model=settings.LITELLM_TEXT_MODEL, messages=messages, tools=self.tools)
                response_message = response.choices[0].message
                messages.append(response_message)

                if not response_message.tool_calls:
                    return [] # Agent finished without a final action

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = self.available_functions.get(function_name)
                    if not function_to_call: continue

                    args = json.loads(tool_call.function.arguments)
                    
                    if function_name == "get_elements_by_id":
                        tool_output = function_to_call(**args)
                        messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps(tool_output)})
                    else:
                        # For action tools, the function itself returns the final command list
                        return function_to_call(**args)

            except Exception:
                logger.exception("An error occurred in ComponentCrafter's conversational loop.")
                return [{"type": "error", "payload": {"message": "An unexpected error occurred."}}]

        logger.error("ComponentCrafter exceeded max conversation turns.")
        return [{"type": "error", "payload": {"message": "The component creation process timed out."}}]
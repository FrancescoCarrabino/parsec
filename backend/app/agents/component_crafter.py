# parsec-backend/app/agents/component_crafter.py

import json
from litellm import acompletion
from loguru import logger
from typing import List, Dict, Any

from ..services.workspace_service import WorkspaceService
from ..core.config import settings
from .shared_tools import GET_ELEMENTS_BY_ID_TOOL, CommonCanvasTools # Import the tool and its implementation class

class ComponentCrafter:
    def __init__(self, workspace_service: WorkspaceService, common_tools: CommonCanvasTools):
        self.workspace_service = workspace_service
        self.common_tools = common_tools # Store the tools implementation
        self.model = settings.LITELLM_TEXT_MODEL
        self.system_prompt = """
You are a specialist agent called 'ComponentCrafter'. Your sole purpose is to help a user create a reusable 'Component' from a selection of existing elements on a design canvas.

You operate in a strict, multi-step process:

1.  **Get Name**: First, determine the desired name for the component from the user's prompt. If the user doesn't provide one, you MUST ask them for one by calling the `request_user_input` tool. Do not proceed without a name.

2.  **Inspect Elements**: Once you have the name, you MUST call the `get_elements_by_id` tool, providing the list of element IDs the user has selected. This is CRUCIAL for you to understand what you are working with. Do not skip this step.

3.  **Analyze and Define Schema**: After you receive the element data from `get_elements_by_id`, analyze it to create a `schema` of editable properties.
    - For any `TextElement`, create a property to control its `content`. Name the property logically, like `button_text` or `user_name`.
    - For any `ShapeElement` that is clearly a background or has a prominent color, create a property to control its `fill`. The `prop_name` should be like `background_color` or `icon_color`, and the `target_property` MUST be `fill`. The `prop_type` must be `color`.
    - You MUST identify the target element by its `id` in the `target_element_id` field.

4.  **Create Component**: As your FINAL action, you MUST call the `define_component_from_elements` tool. You will provide the `name` from Step 1, the original `element_ids`, and the `schema` you generated in Step 3.
"""

    def _get_tools(self):
        """Defines all tools available to this agent."""
        return [
            GET_ELEMENTS_BY_ID_TOOL,
            {
                "type": "function",
                "function": {
                    "name": "define_component_from_elements",
                    "description": "The final action to create a component definition from a list of element IDs, a name, and a schema.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "The desired name for the new component."},
                            "element_ids": {"type": "array", "items": {"type": "string"}},
                            "schema": { "type": "array", "items": {"type": "object"}, "description": "A list of property definitions that you have intelligently generated."}
                        },
                        "required": ["name", "element_ids", "schema"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "request_user_input",
                    "description": "Ask the user for more information when the component name is missing from the prompt.",
                    "parameters": {
                        "type": "object",
                        "properties": { "query": {"type": "string"}},
                        "required": ["query"],
                    },
                },
            },
        ]

    async def process_component_request(self, prompt: str, selected_element_ids: List[str]) -> List[Dict[str, Any]]:
        """Handles the multi-step conversation to intelligently create a component."""
        if not selected_element_ids:
            return [{"type": "error", "payload": {"message": "Please select one or more elements to create a component."}}]

        # Initialize the conversation with the system prompt and the user's request
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"User Prompt: '{prompt}'.\nSelected element IDs: {selected_element_ids}"}
        ]
        
        # Loop to allow for multiple tool calls (e.g., get_elements -> define_component)
        for _ in range(3): # Set a max of 3 turns to prevent infinite loops
            try:
                response = await acompletion(
                    model=self.model, messages=messages, tools=self._get_tools(), tool_choice="auto",
                )
                
                response_message = response.choices[0].message
                messages.append(response_message) # Add AI's response to history

                if not response_message.tool_calls:
                    logger.warning("ComponentCrafter finished without a final tool call.")
                    return [{"type": "info", "payload": {"message": "Component creation process finished."}}]

                # --- Execute Tool Calls and Get Results ---
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    raw_args = tool_call.function.arguments
                    args = json.loads(raw_args)
                    
                    logger.info(f"ComponentCrafter calling tool: {function_name} with args: {args}")
                    
                    tool_response_content = None

                    # Call the appropriate tool implementation
                    if function_name == "get_elements_by_id":
                        tool_response_content = self.common_tools.get_elements_by_id(ids=args["ids"])
                    elif function_name == "define_component_from_elements":
                        definition, instance, deleted_ids = self.workspace_service.create_component_from_elements(
                            name=args["name"],
                            source_element_ids=args["element_ids"],
                            schema=args.get("schema", [])
                        )
                        if definition and instance:
                            # This is the final, successful action. Build and return all commands.
                            commands = [
                                {"type": "COMPONENT_DEFINITION_CREATED", "payload": definition.model_dump()},
                                {"type": "ELEMENT_CREATED", "payload": instance.model_dump()}
                            ]
                            commands.extend([{"type": "ELEMENT_DELETED", "payload": {"id": del_id}} for del_id in deleted_ids])
                            return commands
                        else:
                            return [{"type": "error", "payload": {"message": "Failed to create the component in the workspace."}}]
                    elif function_name == "request_user_input":
                        return [{"type": "request_user_input", "payload": {"query": args["query"]}}]

                    # Append the tool's result to the message history for the next turn
                    if tool_response_content is not None:
                        messages.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": json.dumps(tool_response_content),
                        })

            except Exception:
                logger.exception("An error occurred in ComponentCrafter's conversational loop.")
                return [{"type": "error", "payload": {"message": "An unexpected error occurred while creating the component."}}]

        logger.error("ComponentCrafter exceeded max conversation turns.")
        return [{"type": "error", "payload": {"message": "The component creation process timed out."}}]
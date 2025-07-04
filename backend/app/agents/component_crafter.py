# parsec-backend/app/agents/component_crafter.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional, Tuple
from loguru import logger

from ..core.config import settings
from ..services.workspace_service import WorkspaceService
from .shared_tools import CommonCanvasTools, GET_CANVAS_ELEMENTS_TOOL

class ComponentCrafter:
    """A specialist agent for defining and creating reusable components."""

    def __init__(self, workspace_service: WorkspaceService, common_tools: CommonCanvasTools):
        self.workspace = workspace_service
        self.common_tools = common_tools
        
        # This agent's primary tool is for defining a new component.
        self.tools: List[Dict[str, Any]] = [
            GET_CANVAS_ELEMENTS_TOOL, # It needs to see what it's working with.
            {
                "type": "function",
                "function": {
                    "name": "define_component_from_elements",
                    "description": "Creates a new, reusable component definition from a selection of existing elements. This is the final action to take once the component's name and properties (schema) are clear.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "A descriptive name for the new component, e.g., 'User Profile Card' or 'Primary Button'."
                            },
                            "source_element_ids": {
                                "type": "array",
                                "description": "A list of the IDs of the elements on the canvas that will form this component.",
                                "items": {"type": "string"}
                            },
                            "schema": {
                                "type": "array",
                                "description": "The schema defining the customizable properties of the component.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "prop_name": {"type": "string", "description": "The machine-readable name for the property, e.g., 'userName' or 'avatarUrl'."},
                                        "target_element_id": {"type": "string", "description": "The ID of the source element this property controls."},
                                        "target_property": {"type": "string", "description": "The attribute of the target element to modify, e.g., 'content' for text, 'src' for images."},
                                        "prop_type": {"type": "string", "enum": ["text", "image_url", "color"], "description": "The data type of the property."}
                                    },
                                    "required": ["prop_name", "target_element_id", "target_property", "prop_type"]
                                }
                            }
                        },
                        "required": ["name", "source_element_ids", "schema"]
                    }
                }
            }
        ]

        self.available_functions: Dict[str, Callable] = {
            "get_canvas_elements": self.common_tools.get_canvas_elements,
            "define_component_from_elements": self.define_component_from_elements
        }
        logger.info("ComponentCrafter specialist initialized.")

    def define_component_from_elements(self, name: str, source_element_ids: List[str], schema: List[Dict]) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Implementation of the tool to create a component."""
        logger.info(f"Executing tool 'define_component_from_elements' for component '{name}'.")
        
        new_def, new_inst, deleted_ids = self.workspace.create_component_from_elements(name, source_element_ids, schema)
        
        if not new_def or not new_inst:
            # Return an empty list if creation failed.
            return [], []

        # We need to inform the frontend about all the changes in this transaction.
        commands = []
        # 1. A command to register the new definition.
        commands.append({"type": "component_definition_created", "payload": new_def.model_dump()})
        # 2. A command to delete all the original elements.
        for del_id in deleted_ids:
            commands.append({"type": "element_deleted", "payload": {"id": del_id}})
        # 3. A command to create the new component instance on the canvas.
        commands.append({"type": "element_created", "payload": new_inst.model_dump()})
        
        # The ID of the new instance is the "last touched" element for conversational context.
        affected_ids = [new_inst.id]
        
        return commands, affected_ids

    async def process_component_request(
        self, prompt_text: str, selected_ids: List[str]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        logger.info(f"ComponentCrafter received prompt: '{prompt_text}' for elements: {selected_ids}")
        if not selected_ids:
            logger.warning("ComponentCrafter called without any selected elements.")
            return [], []

        # --- THIS IS THE CRITICAL FIX ---
        # We are making the instructions much more explicit to prevent looping.
        system_prompt = (
            "You are a 'Component Crafter' assistant. Your job is to turn a user's selection of canvas elements into a reusable component definition. You operate in a strict, methodical loop:\n\n"
            "1.  **ASSESS:** The user has provided a prompt and selected a set of elements. Your first step is to call `get_canvas_elements` to get the full properties of every element on the canvas. **Do this only once.**\n\n"
            "2.  **REASON & ACT:** After you have received the element data from `get_canvas_elements`, you have all the information you need. **DO NOT call `get_canvas_elements` again.** Your next and final step MUST be to call `define_component_from_elements`. Analyze the user's prompt and the element data to construct the arguments for this final tool call:\n"
            "   -   `name`: Extract the component's name from the user's prompt (e.g., 'User Profile Card').\n"
            "   -   `source_element_ids`: This is the list of IDs the user has selected.\n"
            "   -   `schema`: Meticulously build the schema by matching the user's description (e.g., 'the text is the title') to the element IDs and their properties ('content' for text, 'src' for images, 'fill' for shapes).\n\n"
            "Your entire process is two steps: first `get_canvas_elements`, then `define_component_from_elements`. There is no third step."
        )

        contextual_prompt = f"User Request: '{prompt_text}'. The user has selected these elements to form the component: {json.dumps(selected_ids)}."
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": contextual_prompt}
        ]
        
        # --- Increase loop limit slightly for this complex task ---
        try:
            for i in range(7): # A slightly longer loop limit, just in case.
                # If we are in a loop, add a message to try and break it.
                if i > 2:
                    full_messages.append({"role": "user", "content": "I have already provided the element data. Please call `define_component_from_elements` now."})

                logger.info(f"ComponentCrafter Loop, Iteration {i+1}")
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=full_messages, tools=self.tools, tool_choice="auto",
                    api_key=settings.AZURE_API_KEY_TEXT, api_base=settings.AZURE_API_BASE_TEXT, api_version=settings.AZURE_API_VERSION_TEXT
                )
                response_message = response.choices[0].message
                full_messages.append(response_message)
                
                if not response_message.tool_calls:
                    logger.warning("Agent stopped without a final tool call.")
                    break

                all_commands: List[Dict[str, Any]] = []
                all_affected_ids: List[str] = []
                
                # We need a flag to check if we made our final, successful call
                did_define_component = False

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    logger.info(f"Agent wants to call tool: '{function_name}'")
                    function_to_call = self.available_functions.get(function_name)
                    if not function_to_call: continue
                    function_args = json.loads(tool_call.function.arguments)

                    if function_name == "get_canvas_elements":
                        tool_output = function_to_call(**function_args)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps(tool_output)})
                    elif function_name == "define_component_from_elements":
                        commands, affected_ids = function_to_call(**function_args)
                        all_commands.extend(commands)
                        all_affected_ids.extend(affected_ids)
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success"})})
                        did_define_component = True # Mark that we have succeeded.
                    else:
                        # Handle any other unexpected tool calls
                        full_messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "error", "message": "Unexpected tool call."})})


                # If we called the final tool, we can exit the loop.
                if did_define_component:
                    logger.success(f"ComponentCrafter concluded, generating {len(all_commands)} commands.")
                    return all_commands, all_affected_ids
            
            logger.error("ComponentCrafter loop finished without defining a component.")
            return [], []
        except Exception:
            logger.exception("An error occurred in the ComponentCrafter's reasoning loop.")
            return [], []
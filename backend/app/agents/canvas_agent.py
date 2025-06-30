import json
import litellm

# Use standard Python types here as well
from typing import List, Dict, Callable, Any
from loguru import logger

from ..services.workspace_service import WorkspaceService
from ..models.elements import ShapeElement


class CanvasAgent:
    """A specialist agent for all canvas design and manipulation tasks."""

    def __init__(self, workspace_service: WorkspaceService):
        self.workspace = workspace_service
        # The tool definitions are just dictionaries, so no special type is needed.
        self.tools: List[Dict[str, Any]] = [
            {
                "type": "function",
                "function": {
                    "name": "create_shape",
                    "description": "Creates a new shape on the canvas.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shape_type": {
                                "type": "string",
                                "enum": ["rect", "circle"],
                            },
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "fill": {"type": "string"},
                            "width": {"type": "number"},
                            "height": {"type": "number"},
                        },
                        "required": ["shape_type", "x", "y", "fill"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_canvas_elements",
                    "description": "Retrieves a list of all elements on the canvas.",
                    "parameters": {"type": "object", "properties": {}},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "update_elements",
                    "description": "Updates one or more elements on the canvas with new properties.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "updates": {
                                "type": "array",
                                "description": "A list of update objects. Each must contain an 'id' and the properties to change.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "x": {"type": "number"},
                                        "y": {"type": "number"},
                                        "width": {"type": "number"},
                                        "height": {"type": "number"},
                                        # --- THIS IS THE CHANGE ---
                                        "fill": {
                                            "type": "object",
                                            "description": "The fill style. Can be a solid color or a gradient.",
                                            "properties": {
                                                "type": {
                                                    "type": "string",
                                                    "enum": [
                                                        "solid",
                                                        "linear-gradient",
                                                    ],
                                                },
                                                "color": {
                                                    "type": "string",
                                                    "description": "CSS color for solid fill.",
                                                },
                                                "angle": {
                                                    "type": "integer",
                                                    "description": "Angle for gradient fill.",
                                                },
                                                "stops": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object",
                                                        "properties": {
                                                            "color": {"type": "string"},
                                                            "offset": {
                                                                "type": "number"
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                        # --------------------------
                                        "stroke": {"type": "string"},
                                        "stroke_width": {"type": "number"},
                                        "rotation": {"type": "number"},
                                        "isVisible": {"type": "boolean"},
                                        "zIndex": {"type": "integer"},
                                        "name": {"type": "string"},
                                    },
                                    "required": ["id"],
                                },
                            }
                        },
                        "required": ["updates"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "reorder_element",
                    "description": "Changes the stacking order of a single element (z-index).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "element_id": {
                                "type": "string",
                                "description": "The ID of the element to reorder.",
                            },
                            "command": {
                                "type": "string",
                                "description": "The reordering action to perform.",
                                "enum": [
                                    "BRING_FORWARD",
                                    "SEND_BACKWARD",
                                    "BRING_TO_FRONT",
                                    "SEND_TO_BACK",
                                ],
                            },
                        },
                        "required": ["element_id", "command"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "group_elements",
                    "description": "Groups a list of elements together into a single, selectable unit.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "element_ids": {
                                "type": "array",
                                "description": "A list of the IDs of the elements to be grouped.",
                                "items": {"type": "string"},
                            }
                        },
                        "required": ["element_ids"],
                    },
                },
            },
        ]
        self.available_functions: Dict[str, Callable] = {
            "create_shape": self.create_shape,
            "get_canvas_elements": self.get_canvas_elements,
            "update_elements": self.update_elements,
            "reorder_element": self.reorder_element,
            "group_elements": self.group_elements,
        }
        logger.info("CanvasAgent specialist initialized.")

    # Tool Implementations remain the same
    def create_shape(self, **kwargs) -> Dict[str, Any]:
        """Creates a shape element and adds it to the workspace."""
        logger.info(f"Executing tool 'create_shape' with args: {kwargs}")

        if "fill" in kwargs and isinstance(kwargs["fill"], str):
            kwargs["fill"] = {"type": "solid", "color": kwargs["fill"]}
        # -------------------------------------------------

        element = ShapeElement(**kwargs)
        self.workspace.add_element(element)
        return {"type": "element_created", "payload": element.model_dump()}

    def get_canvas_elements(self) -> List[Dict[str, Any]]:
        logger.info("Executing tool 'get_canvas_elements'")
        return self.workspace.get_all_elements()

    def update_elements(self, updates: List[Dict]) -> Dict[str, Any]:
        logger.info(f"Executing tool 'update_elements' with {len(updates)} update(s).")
        updated_elements = []
        for update_data in updates:
            element_id = update_data.pop("id")
            updated = self.workspace.update_element(element_id, update_data)
            if updated:
                updated_elements.append(updated.model_dump())
        return {"type": "elements_updated", "payload": updated_elements}

    def reorder_element(self, element_id: str, command: str) -> Dict[str, Any]:
        """Calls the workspace service to reorder and returns an update command."""
        logger.info(
            f"Executing tool 'reorder_element' for {element_id} with command {command}"
        )
        # The service does the heavy lifting
        updated_elements = self.workspace.reorder_element(element_id, command)

        # We need to send back all the elements that were affected by the reordering
        updated_payload = [el.model_dump() for el in updated_elements]
        return {"type": "elements_updated", "payload": updated_payload}

    def group_elements(self, element_ids: List[str]) -> Dict[str, Any]:
        """Calls the workspace service to group elements."""
        logger.info(f"Executing tool 'group_elements' for IDs: {element_ids}")
        affected_elements = self.workspace.group_elements(element_ids)

        # We send back all affected elements (the new group + the updated children)
        updated_payload = [el.model_dump() for el in affected_elements]
        return {"type": "elements_updated", "payload": updated_payload}

    # Main Execution Logic
    async def process_prompt(
        self, prompt_text: str, messages: List[Dict[str, Any]], model: str
    ) -> List[Dict[str, Any]]:
        logger.info("CanvasAgent is now handling the request.")

        system_prompt = (
            "You are a precise and methodical design assistant named Parsec. Your goal is to translate user requests into specific tool calls. You operate in a loop:\n"
            "1.  **ASSESS:** If the user's request concerns existing elements, your first step is ALWAYS to call `get_canvas_elements` to understand the current state. Do not try to guess.\n"
            "2.  **REASON:** After you have the canvas state, analyze it in relation to the user's request. Form a plan.\n"
            "3.  **ACT:** Based on your plan, call the appropriate action tool (`create_shape` or `update_elements`) with the precise parameters needed to execute the plan.\n"
            "Do not respond with conversational text. Only respond with tool calls."
        )

        # Prepend the specialist's system prompt to the conversation history
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ] + messages

        try:
            for _ in range(5):
                response = await litellm.acompletion(
                    model=model,
                    messages=full_messages,
                    tools=self.tools,
                    tool_choice="auto",
                )
                response_message = response.choices[0].message
                full_messages.append(response_message)

                if not response_message.tool_calls:
                    break

                final_commands = []
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = self.available_functions.get(function_name)
                    if not function_to_call:
                        continue

                    function_args = json.loads(tool_call.function.arguments)

                    if function_name == "get_canvas_elements":
                        tool_output = function_to_call(**function_args)
                        full_messages.append(
                            {
                                "tool_call_id": tool_call.id,
                                "role": "tool",
                                "name": function_name,
                                "content": json.dumps(tool_output),
                            }
                        )
                    else:
                        command_for_frontend = function_to_call(**function_args)
                        final_commands.append(command_for_frontend)
                        full_messages.append(
                            {
                                "tool_call_id": tool_call.id,
                                "role": "tool",
                                "name": function_name,
                                "content": json.dumps({"status": "success"}),
                            }
                        )

                if final_commands:
                    logger.success(
                        f"CanvasAgent concluded with {len(final_commands)} command(s)."
                    )
                    return final_commands
            return []
        except Exception:
            logger.exception("An error occurred in the CanvasAgent's reasoning loop.")
            return []

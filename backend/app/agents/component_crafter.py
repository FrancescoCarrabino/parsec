import json
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService


class ComponentCrafter(Agent):
    """
    An autonomous agent that creates reusable UI/UX components from a selection
    of existing elements on the canvas.
    """

    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service

    @property
    def name(self) -> str:
        return "ComponentCrafter"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Creates reusable UI components (e.g., buttons, cards, profiles) from a selection of existing elements. It intelligently defines which parts of the new component are customizable.",
            "input": "A natural language objective (e.g., 'Create a 'User Card' component from the selection') and the `selected_ids` from the context.",
            "output": "A new ComponentDefinition in the library and a ComponentInstance on the canvas.",
            "limitations": "Requires at least one element to be selected. Works best on common UI patterns.",
        }

    @property
    def tools(self) -> List[Tool]:
        return [
            Tool(
                function={
                    "name": "get_elements_by_id",
                    "description": "Retrieves the properties of one or more elements to inspect their content and type before creating a component.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "element_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                            }
                        },
                        "required": ["element_ids"],
                    },
                }
            ),
            Tool(
                function={
                    "name": "define_component_from_elements",
                    "description": "The final step to create the component definition and instance from the source elements.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "A descriptive name for the new component (e.g., 'Primary Button', 'User Profile Card').",
                            },
                            "source_element_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "The original element IDs to be converted into the component.",
                            },
                            "schema": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "prop_name": {
                                            "type": "string",
                                            "description": "A machine-readable name for the property (e.g., 'button_label', 'user_avatar_src').",
                                        },
                                        "target_element_id": {
                                            "type": "string",
                                            "description": "The ID of the element within the component that this property controls.",
                                        },
                                        "target_property": {
                                            "type": "string",
                                            "description": "The attribute of the target element to change (e.g., 'content' for text, 'src' for images).",
                                        },
                                        "prop_type": {
                                            "type": "string",
                                            "enum": ["text", "image_url", "color"],
                                            "description": "The data type of the property.",
                                        },
                                    },
                                    "required": [
                                        "prop_name",
                                        "target_element_id",
                                        "target_property",
                                        "prop_type",
                                    ],
                                },
                                "description": "A list defining the customizable properties of the component.",
                            },
                        },
                        "required": ["name", "source_element_ids", "schema"],
                    },
                }
            ),
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        return {
            "get_elements_by_id": self._get_elements_by_id,
            "define_component_from_elements": self._define_component_from_elements,
        }

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable,
        send_status_update: Callable,
    ) -> Dict[str, Any]:
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")
        element_ids = context.get("selected_ids", [])
        if not element_ids:
            return {
                "status": "failed",
                "error": "ComponentCrafter requires at least one element to be selected.",
            }

        system_prompt = f"""
        You are an expert UI/UX Component Designer. Your job is to convert a selection of raw elements into a smart, reusable component. You MUST follow this two-step process:

        1.  **INSPECT:** First, you MUST call the `get_elements_by_id` tool to see what the user has selected. This is a mandatory first step.
        2.  **DEFINE:** After you receive the element data, analyze it to understand its purpose (e.g., a button, a user card). Based on your analysis, generate a `schema` of customizable properties. For example, a text element's 'content' should be a property, and an image's 'src' should be a property. Then, call the `define_component_from_elements` tool with the component name, the original element IDs, and the schema you designed.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Objective: '{objective}'. Selected element IDs are: {json.dumps(element_ids)}",
            },
        ]

        try:
            # Use the standard tool-calling loop. It will handle the multi-step reasoning.
            for _ in range(3):  # Limit to 3 steps: inspect -> define -> finish
                await send_status_update(
                    "THINKING",
                    "Analyzing selected elements...",
                    {"agent_name": self.name},
                )
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL,
                    messages=messages,
                    tools=[t.model_dump() for t in self.tools],
                    temperature=0.1,
                    api_key=settings.AZURE_API_KEY_TEXT,
                    api_base=settings.AZURE_API_BASE_TEXT,
                    api_version=settings.AZURE_API_VERSION_TEXT,
                )
                response_message = response.choices[0].message
                if not response_message.tool_calls:
                    break

                messages.append(response_message)
                for tool_call in response_message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    await send_status_update(
                        "INVOKING_TOOL",
                        f"Using tool: {tool_name}...",
                        {"target_tool": tool_name},
                    )
                    tool_function = self.available_functions.get(tool_name)
                    tool_result = await tool_function(context=context, **tool_args)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_name,
                            "content": json.dumps(tool_result),
                        }
                    )

            return {"status": "success"}
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {"status": "failed", "error": str(e)}

    # --- Tool Implementations ---
    async def _get_elements_by_id(
        self, context: dict, element_ids: List[str]
    ) -> Dict[str, Any]:
        elements = [
            self._workspace.elements.get(eid)
            for eid in element_ids
            if self._workspace.elements.get(eid)
        ]
        # Return a simplified summary for the LLM
        summary = [
            {
                "id": el.id,
                "element_type": el.element_type,
                "content": getattr(el, "content", None),
                "src": getattr(el, "src", None),
            }
            for el in elements
        ]
        return {"elements": summary}

    async def _define_component_from_elements(
        self,
        context: dict,
        name: str,
        source_element_ids: List[str],
        schema: List[Dict],
    ) -> Dict[str, Any]:
        new_def, new_inst, deleted_ids = self._workspace.create_component_from_elements(
            name, source_element_ids, schema
        )
        if not new_def or not new_inst:
            return {
                "status": "failed",
                "error": "Workspace service failed to create the component.",
            }

        # Append all necessary commands to the main workflow context
        context["commands"].append(
            {"type": "COMPONENT_DEFINITION_CREATED", "payload": new_def.model_dump()}
        )
        context["commands"].append(
            {"type": "ELEMENT_CREATED", "payload": new_inst.model_dump()}
        )
        for an_id in deleted_ids:
            context["commands"].append(
                {"type": "ELEMENT_DELETED", "payload": {"id": an_id}}
            )

        return {
            "status": "success",
            "definition_id": new_def.id,
            "instance_id": new_inst.id,
        }

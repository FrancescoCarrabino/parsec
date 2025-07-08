import json
import uuid
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService

class CanvasAgent(Agent):
    """
    An autonomous agent that creates and modifies individual elements directly on the canvas.
    It can reason about placement and style, and can invoke other agents to fetch content or images.
    """
    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service

    @property
    def name(self) -> str: return "CanvasAgent"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "To create, place, or modify individual elements (text, images, shapes) on the main canvas from a high-level objective. Use this when a full slide is not requested.",
            "input": "A high-level natural language objective (e.g., 'Create an image of a dog', 'Add the text 'Hello World' to the canvas', 'Make the selected text blue').",
            "output": "A set of commands to create or modify elements on the canvas, added to the workflow context.",
            "limitations": "Does not create complex, multi-element compositions like slides. For that, use SlideDesigner."
        }

    @property
    def tools(self) -> List[Tool]:
        # These are the fundamental, low-level tools its "brain" can use.
        return [
            Tool(function={
                "name": "create_shape",
                "description": "Creates a basic geometric shape (rectangle or ellipse) on the canvas with a specified fill color.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "shape_type": {"type": "string", "enum": ["rect", "ellipse"], "description": "The type of shape to create."},
                        "fill_color": {"type": "string", "description": "The hex color code for the shape's fill, e.g., '#FF0000' for red."},
                    },
                    "required": ["shape_type", "fill_color"]
                }
            }),
            Tool(function={
                "name": "create_text_element",
                "description": "Creates a text element on the canvas with specified content. The agent will decide on default styling and placement.",
                "parameters": {
                    "type": "object",
                    "properties": {"content": {"type": "string", "description": "The text to display."}},
                    "required": ["content"]
                }
            }),
            Tool(function={
                "name": "create_image_element",
                "description": "Places an image on the canvas using a provided URL.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "image_url": {"type": "string", "description": "The URL of the image to display."},
                        "alt_text": {"type": "string", "description": "A descriptive alt text for the image."}
                    },
                    "required": ["image_url", "alt_text"]
                }
            }),
            Tool(function={
                "name": "update_element_properties",
                "description": "Updates properties of an existing element on the canvas, identified by its ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "element_id": {"type": "string", "description": "The ID of the element to modify."},
                        "updates": {"type": "object", "description": "A dictionary of properties to update, e.g., {'fill': {'type': 'solid', 'color': '#0000FF'}}."}
                    },
                    "required": ["element_id", "updates"]
                }
            }),
            Tool(function={
                "name": "invoke_agent",
                "description": "Calls another specialist agent to get information, like text from ContentCrafter or an image URL from ImageGenius.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "agent_name": {"type": "string", "enum": ["ContentCrafter", "ImageGenius"]},
                        "objective": {"type": "string", "description": "The high-level objective to give to the other agent."}
                    },
                    "required": ["agent_name", "objective"]
                }
            })
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        return {
            "create_shape": self._create_shape,
            "create_text_element": self._create_text_element,
            "create_image_element": self._create_image_element,
            "update_element_properties": self._update_element_properties,
            # invoke_agent is handled specially
        }

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]],
        send_status_update: Callable
    ) -> Dict[str, Any]:
        """
        This is the agent's "brain". It uses an LLM to plan and execute the objective.
        """
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")

        system_prompt = f"""
        You are an expert canvas manipulator. Your task is to take a high-level objective and break it down into a sequence of tool calls to create or modify elements on the canvas.

        **Your Process:**
        1.  **Analyze Objective:** Understand what the user wants to create or change.
        2.  **Check Context:** Look at the 'selected_ids' in the context. If they exist, the user is likely trying to modify something.
        3.  **Get Content:** If you need content (text, image URL), you MUST use the `invoke_agent` tool to call `ContentCrafter` or `ImageGenius`.
        4.  **Plan Actions:** Use your `create_*` or `update_*` tools to perform the action. You must decide on reasonable default positions (e.g., x=100, y=100) and sizes if not specified.
        5.  **Respond with Tool Calls:** Make one or more tool calls in a single response to execute your plan.

        **Contextual Information:**
        - Selected element IDs: {json.dumps(context.get('selected_ids', []))}
        - Workflow History: {json.dumps(context.get('history', []), indent=2)}
        """

        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": objective}]

        try:
            # Re-usable tool-calling loop, identical to SlideDesigner's
            for _ in range(5):
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=messages,
                    tools=[t.model_dump() for t in self.tools], temperature=0.1,
                    api_key=settings.AZURE_API_KEY_TEXT,
                    api_base=settings.AZURE_API_BASE_TEXT,
                    api_version=settings.AZURE_API_VERSION_TEXT,
                )
                response_message = response.choices[0].message

                if not response_message.tool_calls:
                    break # Finished thinking

                messages.append(response_message)

                for tool_call in response_message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    logger.info(f"CanvasAgent is calling tool '{tool_name}' with args: {tool_args}")
                    
                    if tool_name == "invoke_agent":
                        agent_to_call = tool_args.get("agent_name")
                        agent_objective = tool_args.get("objective")
                        await send_status_update("INVOKING_AGENT", f"Asking the {agent_to_call} for help...", {"target_agent": agent_to_call})
                        tool_result = await invoke_agent(agent_to_call, agent_objective, context)
                    else:
                        tool_function = self.available_functions.get(tool_name)
                        # Pass context so tools can append commands
                        await send_status_update("INVOKING_TOOL", f"Using the tool {tool_function}...", {"target_tool": tool_name})
                        tool_result = await tool_function(context=context, **tool_args)
                    
                    messages.append({
                        "role": "tool", "tool_call_id": tool_call.id,
                        "name": tool_name, "content": json.dumps(tool_result),
                    })
            
            return {"status": "success"}

        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {"status": "failed", "error": str(e)}

    # --- Tool Implementations ---
    async def _create_shape(self, context: dict, shape_type: str, fill_color: str) -> dict:
        """Creates a shape with default sizing and positioning."""
        payload = {
            "element_type": "shape",
            "shape_type": shape_type,
            "x": 150, "y": 150, "width": 200, "height": 200, # Reasonable defaults
            "fill": {"type": "solid", "color": fill_color} # Use the color from the LLM
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element:
            return {"status": "failed", "error": "Workspace failed to create shape element."}

        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}
    
    async def _create_text_element(self, context: dict, content: str) -> dict:
        payload = {
            "element_type": "text", "content": content,
            "x": 100, "y": 100, "width": 400, "height": 50, # Reasonable defaults
            "fontSize": 32, "fontColor": "#333333"
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element: return {"status": "failed", "error": "Workspace failed to create text element."}

        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}

    async def _create_image_element(self, context: dict, image_url: str, alt_text: str) -> dict:
        payload = {
            "element_type": "image", "src": image_url, "alt_text": alt_text,
            "x": 100, "y": 100, "width": 512, "height": 512 # Reasonable defaults
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element: return {"status": "failed", "error": "Workspace failed to create image element."}
        
        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}

    async def _update_element_properties(self, context: dict, element_id: str, updates: dict) -> dict:
        element = self._workspace.update_element(element_id, updates)
        if not element: return {"status": "failed", "error": f"Workspace failed to update element {element_id}."}

        context["commands"].append({"type": "ELEMENT_UPDATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}
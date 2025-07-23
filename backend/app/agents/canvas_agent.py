import json
import uuid
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine, Literal

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService


class CanvasAgent(Agent):
    """
    An autonomous agent that creates, places, and modifies individual and compound
    elements directly on the canvas. It is the primary "builder" agent for UI layouts,
    interpreting precise instructions from higher-level agents like FrontendArchitect.
    """

    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service

    @property
    def name(self) -> str:
        return "CanvasAgent"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Creates, places, and modifies individual elements (text, images, shapes, frames) and compound UI patterns (headers, sidebars, data cards) on the main canvas. It takes precise instructions and applies styling.",
            "input": "A precise objective specifying the element to create or modify (type, content/source, dimensions, styling) and its exact coordinates (x, y). Can also accept parentId for nested elements.",
            "output": "A set of commands to create or modify elements on the canvas, added to the workflow context.",
            "limitations": "Cannot make autonomous design decisions or orchestrate multiple steps without explicit instructions. It executes, does not plan complex workflows.",
        }

    @property
    def tools(self) -> List[Tool]:
        return [
            # --- Individual Element Creation Tools (with more styling options) ---
            Tool(
                function={
                    "name": "create_shape",
                    "description": "Creates a styled geometric shape (rectangle or ellipse).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shape_type": {
                                "type": "string",
                                "enum": ["rect", "ellipse"],
                                "description": "The type of shape to create.",
                            },
                            "x": {"type": "number", "description": "The x-coordinate."},
                            "y": {"type": "number", "description": "The y-coordinate."},
                            "width": {
                                "type": "number",
                                "description": "The width of the shape.",
                            },
                            "height": {
                                "type": "number",
                                "description": "The height of the shape.",
                            },
                            "fill_color": {
                                "type": "string",
                                "description": "Hex color code for the fill (e.g., '#FFFFFF').",
                            },
                            "stroke_color": {
                                "type": "string",
                                "description": "Optional: Hex color code for the border.",
                            },
                            "stroke_width": {
                                "type": "number",
                                "description": "Optional: Width of the border.",
                            },
                            "corner_radius": {
                                "type": "number",
                                "description": "Optional: Radius for rounded corners (for rectangles).",
                            },
                            "parentId": {
                                "type": "string",
                                "description": "Optional: The ID of a parent frame to place this shape inside.",
                            },
                        },
                        "required": [
                            "shape_type",
                            "x",
                            "y",
                            "width",
                            "height",
                            "fill_color",
                        ],
                    },
                }
            ),
            Tool(
                function={
                    "name": "create_text_element",
                    "description": "Creates a styled text element on the canvas.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "The text content of the element.",
                            },
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "width": {"type": "number"},
                            "height": {"type": "number"},
                            "fontSize": {
                                "type": "number",
                                "description": "Font size in pixels.",
                            },
                            "fontColor": {
                                "type": "string",
                                "description": "Hex color code for the text.",
                            },
                            "fontWeight": {
                                "type": "number",
                                "description": "Font weight (e.g., 400 for regular, 700 for bold).",
                            },
                            "textAlign": {
                                "type": "string",
                                "enum": ["left", "center", "right"],
                                "description": "Horizontal text alignment.",
                            },
                            "parentId": {
                                "type": "string",
                                "description": "Optional: The ID of a parent frame to place this text inside.",
                            },
                        },
                        "required": ["content", "x", "y", "width", "height"],
                    },
                }
            ),
            Tool(
                function={
                    "name": "create_image_element",
                    "description": "Creates an image element on the canvas at a specific location using a provided URL.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "image_url": {
                                "type": "string",
                                "description": "The URL of the image to display.",
                            },
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "width": {"type": "number"},
                            "height": {"type": "number"},
                            "alt_text": {
                                "type": "string",
                                "description": "Alternative text for the image.",
                            },
                            "parentId": {
                                "type": "string",
                                "description": "Optional: The ID of a parent frame to place this image inside.",
                            },
                        },
                        "required": ["image_url", "x", "y", "width", "height"],
                    },
                }
            ),
            Tool(
                function={
                    "name": "update_element_properties",
                    "description": "Updates properties of an existing element on the canvas, identified by its ID.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "element_id": {
                                "type": "string",
                                "description": "The ID of the element to modify.",
                            },
                            "updates": {
                                "type": "object",
                                "description": "A dictionary of properties to update, e.g., {'fill': {'type': 'solid', 'color': '#0000FF'}}.",
                            },
                        },
                        "required": ["element_id", "updates"],
                    },
                }
            ),
            # --- Structural/Compound UI Element Tools ---
            Tool(
                function={
                    "name": "create_frame",
                    "description": "Creates an empty, structural container (a frame) on the canvas for organizing UI sections.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "A descriptive name for the frame (e.g., 'Sidebar', 'Main Content').",
                            },
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "width": {"type": "number"},
                            "height": {"type": "number"},
                            "fill_color": {
                                "type": "string",
                                "description": "Optional: Background color of the frame.",
                            },
                            "stroke_color": {
                                "type": "string",
                                "description": "Optional: Border color of the frame.",
                            },
                            "stroke_width": {
                                "type": "number",
                                "description": "Optional: Border width.",
                            },
                            "corner_radius": {
                                "type": "number",
                                "description": "Optional: Radius for rounded corners.",
                            },
                            "parentId": {
                                "type": "string",
                                "description": "Optional: ID of a parent frame to place this frame within.",
                            },
                        },
                        "required": ["name", "x", "y", "width", "height"],
                    },
                }
            ),
            Tool(
                function={
                    "name": "create_header_bar",
                    "description": "Creates a standard header bar for a UI screen, including a logo placeholder and navigation links, within a parent frame.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "parent_frame_id": {
                                "type": "string",
                                "description": "The ID of the main frame to place the header within.",
                            },
                            "height": {
                                "type": "number",
                                "description": "The height of the header bar.",
                            },
                            "logo_text": {
                                "type": "string",
                                "description": "The text for the logo (e.g., 'Parsec').",
                            },
                            "nav_links": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of navigation link texts (e.g., ['Dashboard', 'Analytics']).",
                            },
                        },
                        "required": [
                            "parent_frame_id",
                            "height",
                            "logo_text",
                            "nav_links",
                        ],
                    },
                }
            ),
            Tool(
                function={
                    "name": "create_sidebar_layout",
                    "description": "Creates a standard sidebar for navigation (left or right) within a parent frame.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "parent_frame_id": {
                                "type": "string",
                                "description": "The ID of the main frame to place the sidebar within.",
                            },
                            "width": {
                                "type": "number",
                                "description": "The width of the sidebar.",
                            },
                            "position": {
                                "type": "string",
                                "enum": ["left", "right"],
                                "description": "Position of the sidebar ('left' or 'right').",
                            },
                            "nav_items": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of navigation item texts (e.g., ['Home', 'Profile', 'Settings']).",
                            },
                        },
                        "required": [
                            "parent_frame_id",
                            "width",
                            "position",
                            "nav_items",
                        ],
                    },
                }
            ),
            Tool(
                function={
                    "name": "create_data_card",
                    "description": "Creates a visually distinct card for displaying key metrics or summaries, within a parent frame.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "parent_frame_id": {
                                "type": "string",
                                "description": "The ID of the frame to place the card within.",
                            },
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "width": {"type": "number"},
                            "height": {"type": "number"},
                            "title": {
                                "type": "string",
                                "description": "Main title of the card.",
                            },
                            "value": {
                                "type": "string",
                                "description": "Primary value or metric on the card.",
                            },
                            "subtitle": {
                                "type": "string",
                                "description": "Optional: secondary value or unit.",
                            },
                        },
                        "required": [
                            "parent_frame_id",
                            "x",
                            "y",
                            "width",
                            "height",
                            "title",
                            "value",
                        ],
                    },
                }
            ),
            # --- Inter-Agent Communication Tool ---
            Tool(
                function={
                    "name": "invoke_agent",
                    "description": "Calls another specialist agent to get information, like text from ContentCrafter or an image URL from ImageGenius.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "agent_name": {
                                "type": "string",
                                "enum": ["ContentCrafter", "ImageGenius"],
                            },
                            "objective": {
                                "type": "string",
                                "description": "The high-level objective to give to the other agent.",
                            },
                        },
                        "required": ["agent_name", "objective"],
                    },
                }
            ),
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        # Map tool names to their actual implementations within this agent.
        return {
            "create_shape": self._create_shape,
            "create_text_element": self._create_text_element,
            "create_image_element": self._create_image_element,
            "update_element_properties": self._update_element_properties,
            "create_frame": self._create_frame,
            "create_header_bar": self._create_header_bar,
            "create_sidebar_layout": self._create_sidebar_layout,
            "create_data_card": self._create_data_card,
            # invoke_agent is handled specially in run_task
        }

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]],
        send_status_update: Callable,
    ) -> Dict[str, Any]:
        """
        Parses the objective to identify the element creation/modification intent and parameters,
        then uses the LLM to select the appropriate tool and arguments.
        It can also invoke other agents if it needs content.
        """
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")

        system_prompt = f"""
        You are an expert canvas builder and element manipulator. Your task is to interpret a precise objective and execute it by calling the most appropriate tool with the correct parameters.

        **CRITICAL RULES:**
        1.  **Tool Selection:** Choose ONE tool from the list that best matches the objective.
        2.  **Parameter Extraction:** Extract ALL required parameters precisely from the objective. If the objective is missing information but you can get it from another agent (like text from ContentCrafter or an image URL from ImageGenius), use the `invoke_agent` tool first.
        3.  **Default Values:** If numerical parameters (like x, y, width, height, fontSize, corner_radius, etc.) are NOT explicitly specified in the objective or derivable from context, you MUST infer reasonable, aesthetically pleasing default values.
        4.  **Styling:** For `create_shape`, `create_text_element`, `create_frame`, `create_header_bar`, `create_sidebar_layout`, and `create_data_card`, you MUST apply styling parameters (like `fill_color`, `fontColor`, `fontWeight`, `corner_radius`, `stroke_color`, `stroke_width`) to match a modern, dark UI aesthetic.
        5.  **Parenting:** If an element is to be placed inside a frame, you MUST include the `parentId` parameter with the frame's ID.
        6.  **Output:** Respond ONLY with the tool call JSON.

        **Tool Definitions:**
        {json.dumps([t.model_dump() for t in self.tools], indent=2)}

        **Contextual Information:**
        - Selected element IDs: {json.dumps(context.get('selected_ids', []))}
        - Workflow History (for previous results/element IDs): {json.dumps(context.get('history', []), indent=2)}
        """

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": objective},
        ]

        try:
            # Use a loop to allow the agent to make multiple tool calls (e.g., invoke agent then create element)
            for i in range(
                3
            ):  # Limit to 3 steps to prevent infinite loops (e.g., invoke -> create -> finish)
                await send_status_update(
                    "AGENT_STATUS_UPDATE",
                    f"CanvasAgent thinking (step {i+1})...",
                    {"status": "THINKING", "agent_name": self.name},
                )
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL,
                    messages=messages,
                    tools=[t.model_dump() for t in self.tools],
                    tool_choice="auto",
                    temperature=0.0,
                    api_key=settings.AZURE_API_KEY_TEXT,
                    api_base=settings.AZURE_API_BASE_TEXT,
                    api_version=settings.AZURE_API_VERSION_TEXT,
                )

                response_message = response.choices[0].message
                if not response_message.tool_calls:
                    logger.info("CanvasAgent finished its thought process.")
                    break  # Exit loop if no more tool calls are needed

                messages.append(
                    response_message
                )  # Add AI response to conversation history

                for tool_call in response_message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)

                    await send_status_update(
                        "AGENT_STATUS_UPDATE",
                        f"CanvasAgent using tool: {tool_name}...",
                        {"status": "INVOKING_TOOL", "target_tool": tool_name},
                    )
                    logger.info(
                        f"CanvasAgent is calling tool '{tool_name}' with args: {tool_args}"
                    )

                    tool_result = {
                        "status": "failed",
                        "error": "Tool execution failed or returned unexpected result.",
                    }  # Default failure
                    if tool_name == "invoke_agent":
                        # Special handling for inter-agent communication
                        agent_to_call = tool_args.get("agent_name")
                        agent_objective = tool_args.get("objective")
                        tool_result = await invoke_agent(
                            agent_to_call, agent_objective, context
                        )
                    else:
                        # Standard internal tool call
                        tool_function = self.available_functions.get(tool_name)
                        if tool_function:
                            tool_result = await tool_function(
                                context=context, **tool_args
                            )
                        else:
                            logger.error(
                                f"Tool '{tool_name}' is defined but not implemented in available_functions."
                            )
                            tool_result = {
                                "status": "failed",
                                "error": f"Internal error: Tool '{tool_name}' is not implemented.",
                            }

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
            return {
                "status": "failed",
                "error": f"An error occurred during canvas operation: {str(e)}",
            }

    # --- Tool Implementations ---
    # These methods interact with the WorkspaceService to create/update elements.
    # They append commands to the shared context.

    async def _create_shape(
        self,
        context: dict,
        shape_type: str,
        x: float,
        y: float,
        width: float,
        height: float,
        fill_color: str,
        parentId: str = None,
        stroke_color: str = None,
        stroke_width: float = 1,
        corner_radius: float = 0,
    ) -> dict:
        payload = {
            "element_type": "shape",
            "shape_type": shape_type,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "fill": {"type": "solid", "color": fill_color},
            "cornerRadius": corner_radius,
            "parentId": parentId,
        }
        if stroke_color:
            payload["stroke"] = {"type": "solid", "color": stroke_color}
            payload["strokeWidth"] = stroke_width

        element = self._workspace.create_element_from_payload(payload)
        if not element:
            return {
                "status": "failed",
                "error": "Workspace failed to create shape element.",
            }
        context["commands"].append(
            {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
        )
        return {"element_id": element.id, "status": "success"}

    async def _create_text_element(
        self,
        context: dict,
        content: str,
        x: float,
        y: float,
        width: float,
        height: float,
        parentId: str = None,
        fontSize: int = 16,
        fontColor: str = "#DDDDDD",
        fontWeight: int = 400,
        textAlign: str = "left",
    ) -> dict:
        payload = {
            "element_type": "text",
            "content": content,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "fontSize": fontSize,
            "fontColor": fontColor,
            "fontWeight": fontWeight,
            "textAlign": textAlign,
            "parentId": parentId,
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element:
            return {
                "status": "failed",
                "error": "Workspace failed to create text element.",
            }
        context["commands"].append(
            {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
        )
        return {"element_id": element.id, "status": "success"}

    async def _create_image_element(
        self,
        context: dict,
        image_url: str,
        alt_text: str,
        x: float,
        y: float,
        width: float,
        height: float,
        parentId: str = None,
    ) -> dict:
        payload = {
            "element_type": "image",
            "src": image_url,
            "alt_text": alt_text,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "parentId": parentId,
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element:
            return {
                "status": "failed",
                "error": "Workspace failed to create image element.",
            }
        context["commands"].append(
            {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
        )
        return {"element_id": element.id, "status": "success"}

    async def _update_element_properties(
        self, context: dict, element_id: str, updates: dict
    ) -> dict:
        element = self._workspace.update_element(element_id, updates)
        if not element:
            return {
                "status": "failed",
                "error": f"Workspace failed to update element {element_id}.",
            }
        context["commands"].append(
            {"type": "ELEMENT_UPDATED", "payload": element.model_dump()}
        )
        return {"element_id": element.id, "status": "success"}

    async def _create_frame(
        self,
        context: dict,
        name: str,
        x: float,
        y: float,
        width: float,
        height: float,
        fill_color: str = "rgba(255, 255, 255, 0.05)",
        stroke_color: str = "#444444",
        stroke_width: float = 1,
        corner_radius: float = 0,
        parentId: str = None,
    ) -> dict:
        payload = {
            "element_type": "frame",
            "name": name,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "fill": {"type": "solid", "color": fill_color},
            "stroke": {"type": "solid", "color": stroke_color},
            "strokeWidth": stroke_width,
            "cornerRadius": corner_radius,
            "parentId": parentId,
        }
        element = self._workspace.create_element_from_payload(payload)
        if not element:
            return {"status": "failed", "error": "Workspace failed to create frame."}
        context["commands"].append(
            {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
        )
        return {"element_id": element.id, "status": "success"}

    async def _create_header_bar(
        self,
        context: dict,
        parent_frame_id: str,
        height: float,
        logo_text: str,
        nav_links: List[str],
    ) -> dict:
        frame = self._workspace.elements.get(parent_frame_id)
        if not frame:
            return {
                "status": "failed",
                "error": f"Parent frame {parent_frame_id} not found for header.",
            }

        header_elements_payloads = []
        # Background rectangle for the header
        header_elements_payloads.append(
            {
                "element_type": "shape",
                "shape_type": "rect",
                "parentId": parent_frame_id,
                "x": 0,
                "y": 0,
                "width": frame.width,
                "height": height,
                "fill": {"type": "solid", "color": "#222222"},  # Use palette color
            }
        )
        # Logo text
        header_elements_payloads.append(
            {
                "element_type": "text",
                "parentId": parent_frame_id,
                "content": logo_text,
                "x": 20,
                "y": height / 2 - 12,
                "width": 150,
                "height": 24,
                "fontSize": 20,
                "fontWeight": 700,
                "fontColor": "#007AFF",  # Accent color
            }
        )
        # Navigation links
        current_x = frame.width - 20 - (len(nav_links) * 100)  # Right align
        for link_text in nav_links:
            header_elements_payloads.append(
                {
                    "element_type": "text",
                    "parentId": parent_frame_id,
                    "content": link_text,
                    "x": current_x,
                    "y": height / 2 - 8,
                    "width": 80,
                    "height": 16,
                    "fontSize": 14,
                    "fontColor": "#B0B0B0",
                    "textAlign": "center",
                }
            )
            current_x += 100  # Spacing between links

        elements = self._workspace.create_elements_batch(header_elements_payloads)
        if not elements:
            return {
                "status": "failed",
                "error": "Workspace failed to create header elements.",
            }
        for el in elements:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": el.model_dump()}
            )
        return {"status": "success", "created_element_ids": [el.id for el in elements]}

    async def _create_sidebar_layout(
        self,
        context: dict,
        parent_frame_id: str,
        width: float,
        position: Literal["left", "right"],
        nav_items: List[str],
    ) -> dict:
        frame = self._workspace.elements.get(parent_frame_id)
        if not frame:
            return {
                "status": "failed",
                "error": f"Parent frame {parent_frame_id} not found for sidebar.",
            }

        sidebar_x = 0 if position == "left" else frame.width - width
        sidebar_elements_payloads = []
        # Background for sidebar
        sidebar_elements_payloads.append(
            {
                "element_type": "shape",
                "shape_type": "rect",
                "parentId": parent_frame_id,
                "x": sidebar_x,
                "y": 0,
                "width": width,
                "height": frame.height,
                "fill": {"type": "solid", "color": "#2A2A2A"},  # Use palette color
            }
        )
        # Navigation items
        current_y = 60  # Start below a potential header or just from top
        for item_text in nav_items:
            sidebar_elements_payloads.append(
                {
                    "element_type": "text",
                    "parentId": parent_frame_id,
                    "content": item_text,
                    "x": sidebar_x + 20,
                    "y": current_y,
                    "width": width - 40,
                    "height": 24,
                    "fontSize": 16,
                    "fontColor": "#FFFFFF",
                    "fontWeight": 400,
                }
            )
            current_y += 40  # Spacing between items

        elements = self._workspace.create_elements_batch(sidebar_elements_payloads)
        if not elements:
            return {
                "status": "failed",
                "error": "Workspace failed to create sidebar elements.",
            }
        for el in elements:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": el.model_dump()}
            )
        return {"status": "success", "created_element_ids": [el.id for el in elements]}

    async def _create_data_card(
        self,
        context: dict,
        parent_frame_id: str,
        x: float,
        y: float,
        width: float,
        height: float,
        title: str,
        value: str,
        subtitle: str = None,
    ) -> dict:
        card_elements_payloads = []
        # Card background
        card_elements_payloads.append(
            {
                "element_type": "shape",
                "shape_type": "rect",
                "parentId": parent_frame_id,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "fill": {"type": "solid", "color": "#222222"},  # Use palette color
                "cornerRadius": 8,
            }
        )
        # Title
        card_elements_payloads.append(
            {
                "element_type": "text",
                "parentId": parent_frame_id,
                "content": title,
                "x": x + 20,
                "y": y + 20,
                "width": width - 40,
                "height": 20,
                "fontSize": 16,
                "fontColor": "#B0B0B0",
            }
        )
        # Value
        card_elements_payloads.append(
            {
                "element_type": "text",
                "parentId": parent_frame_id,
                "content": value,
                "x": x + 20,
                "y": y + 45,
                "width": width - 40,
                "height": 30,
                "fontSize": 28,
                "fontWeight": 700,
                "fontColor": "#FFFFFF",
            }
        )
        # Subtitle
        if subtitle:
            card_elements_payloads.append(
                {
                    "element_type": "text",
                    "parentId": parent_frame_id,
                    "content": subtitle,
                    "x": x + 20,
                    "y": y + 80,
                    "width": width - 40,
                    "height": 16,
                    "fontSize": 14,
                    "fontColor": "#888888",
                }
            )

        elements = self._workspace.create_elements_batch(card_elements_payloads)
        if not elements:
            return {
                "status": "failed",
                "error": "Workspace failed to create data card elements.",
            }
        for el in elements:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": el.model_dump()}
            )
        return {"status": "success", "created_element_ids": [el.id for el in elements]}

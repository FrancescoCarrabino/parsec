import json
import uuid
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService

class SlideDesigner(Agent):
    """
    An autonomous agent that designs and creates complete, visually appealing presentation slides.
    It can reason about layout, typography, and content, and can invoke other agents
    to fetch content or images if needed.
    """
    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service
        # Find the next available slide position
        self._next_slide_x = 100
        self._next_slide_y = 100
        self._slide_count = 0

    @property
    def name(self) -> str: return "SlideDesigner"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "To design and create entire presentation slides from a high-level objective. It handles layout, typography, and can autonomously source content and images by calling other agents.",
            "input": "A high-level natural language objective (e.g., 'Create a title slide about AI', 'Make a slide summarizing our Q3 results').",
            "output": "A set of commands to create the elements forming a complete slide, added to the workflow context.",
            "limitations": "Designs are based on its internal style logic. For very specific element-level tweaks, the CanvasAgent is better."
        }

    # --- NEW, MORE FUNDAMENTAL TOOLS ---
    @property
    def tools(self) -> List[Tool]:
        return [
            Tool(function={
                "name": "create_slide_frame",
                "description": "Creates a new, empty slide frame on the canvas at the next available position and adds it to the presentation order. This is the first step for any new slide.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slide_title_for_layer_panel": {"type": "string", "description": "A descriptive name for the slide, e.g., 'Title Slide' or 'Q3 Results'."}
                    },
                    "required": ["slide_title_for_layer_panel"]
                }
            }),
            Tool(function={
                "name": "create_text_element",
                "description": "Creates a text element on a specified slide frame. Use this for titles, subtitles, body text, etc.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "frame_id": {"type": "string", "description": "The ID of the slide frame to place the text on."},
                        "text": {"type": "string", "description": "The content of the text element."},
                        "role": {"type": "string", "enum": ["title", "subtitle", "body", "caption"], "description": "The semantic role of the text, which determines its styling and placement."},
                    },
                    "required": ["frame_id", "text", "role"]
                }
            }),
            Tool(function={
                "name": "create_image_element",
                "description": "Places an image on a specified slide frame.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "frame_id": {"type": "string", "description": "The ID of the slide frame to place the image on."},
                        "image_url": {"type": "string", "description": "The URL of the image to display."},
                        "alt_text": {"type": "string", "description": "A descriptive alt text for the image."},
                    },
                    "required": ["frame_id", "image_url", "alt_text"]
                }
            }),
            Tool(function={
                "name": "invoke_agent",
                "description": "Calls another specialist agent to perform a task and get information. Use this to get content or images.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "agent_name": {"type": "string", "enum": ["ContentCrafter", "ImageGenius"], "description": "The name of the agent to call."},
                        "objective": {"type": "string", "description": "The high-level objective to give to the other agent."},
                    },
                    "required": ["agent_name", "objective"]
                }
            })
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        return {
            "create_slide_frame": self._create_slide_frame,
            "create_text_element": self._create_text_element,
            "create_image_element": self._create_image_element,
            "invoke_agent": None # This is handled specially in run_task
        }

    async def run_task(self, objective: str, context: Dict[str, Any], invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]], send_status_update: Callable) -> Dict[str, Any]:
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")
        
        # This is the agent's "brain". It uses an LLM to think for itself.
        system_prompt = f"""
        You are a world-class presentation designer. Your task is to take a high-level objective and break it down into a sequence of tool calls to create a beautiful and effective slide.

        **Your Process:**
        1.  **Analyze the Objective:** Understand what the user wants on the slide.
        2.  **Check for Content:** Look at the 'Workflow History' for any content (text, image URLs) from previous steps.
        3.  **Get Missing Content:** If you need content (text, bullet points) or an image, you MUST use the `invoke_agent` tool to call `ContentCrafter` or `ImageGenius`.
        4.  **Plan Slide Creation:**
            a. ALWAYS start by calling `create_slide_frame` to create the slide background.
            b. Use the `create_text_element` and `create_image_element` tools to populate the slide.
            c. You are the designer. Decide on the layout. For a title slide, the title should be large and centered. For a content slide, title at the top, body text below.
        5.  **Respond with Tool Calls:** Make one or more tool calls in a single response to execute your plan.

        **Workflow History (for context):**
        {json.dumps(context.get('history', []), indent=2)}
        """

        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": objective}]

        try:
            # We use a loop to allow the agent to make multiple tool calls (e.g., get content, then create slide)
            for _ in range(5): # Max 5 steps to prevent infinite loops
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=messages,
                    tools=[t.model_dump() for t in self.tools],
                    temperature=0.1,
                    api_key=settings.AZURE_API_KEY_TEXT,
                    api_base=settings.AZURE_API_BASE_TEXT,
                    api_version=settings.AZURE_API_VERSION_TEXT,
                )
                response_message = response.choices[0].message

                if not response_message.tool_calls:
                    logger.info("SlideDesigner finished its thought process.")
                    break # Exit loop if no more tool calls are needed

                messages.append(response_message) # Add AI response to history

                # Execute tool calls
                for tool_call in response_message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    logger.info(f"SlideDesigner is calling tool '{tool_name}' with args: {tool_args}")
                    
                    if tool_name == "invoke_agent":
                        # Special handling for inter-agent communication
                        agent_to_call = tool_args.get("agent_name")
                        agent_objective = tool_args.get("objective")
                        await send_status_update("INVOKING_AGENT", f"Asking the {agent_to_call} for help...", {"target_agent": agent_to_call})
                        tool_result = await invoke_agent(agent_to_call, agent_objective, context)
                    else:
                        # Standard internal tool call
                        tool_function = self.available_functions.get(tool_name)
                        # We pass the context so tools can append commands directly
                        await send_status_update("INVOKING_TOOL", f"Using the tool {tool_name}...", {"target_tool": tool_name})
                        tool_result = await tool_function(context=context, **tool_args)
                    
                    # Append tool result to conversation for the next reasoning step
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_name,
                        "content": json.dumps(tool_result),
                    })
            
            return {"status": "success"}

        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {"status": "failed", "error": str(e)}

    # --- Tool Implementations ---
    # These methods now just create elements and append commands to the shared context.
    
    async def _create_slide_frame(self, context: dict, slide_title_for_layer_panel: str) -> dict:
        frame_id = f"frame_{uuid.uuid4().hex[:8]}"
        x, y = self._next_slide_x, self._next_slide_y
        
        # Increment position for the next slide
        self._next_slide_y += 1200 # Spacing between slides
        self._slide_count += 1
        
        payload = {
            "id": frame_id, "element_type": "frame", "name": slide_title_for_layer_panel,
            "x": x, "y": y, "width": 1920, "height": 1080,
            "fill": {"type": "solid", "color": "#FFFFFF"},
            "stroke": {"type": "solid", "color": "#E0E0E0"}
        }
        element = self._workspace.create_element_from_payload(payload) # This adds to workspace but doesn't commit history
        self._workspace.update_presentation_order({"action": "add", "frame_id": frame_id}) # Make it a slide
        
        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"frame_id": frame_id, "status": "success"}

    async def _create_text_element(self, context: dict, frame_id: str, text: str, role: str) -> dict:
        frame = self._workspace.elements.get(frame_id)
        if not frame: return {"error": f"Frame {frame_id} not found."}

        # --- DESIGN LOGIC ---
        # The agent's intelligence for layout and typography lives here.
        if role == "title":
            payload = {"x": 100, "y": 150, "width": 1720, "height": 200, "fontSize": 96, "fontWeight": 700, "textAlign": "center"}
        elif role == "subtitle":
            payload = {"x": 100, "y": 300, "width": 1720, "height": 100, "fontSize": 48, "fontWeight": 400, "textAlign": "center", "fontColor": "#555555"}
        elif role == "body":
            payload = {"x": 150, "y": 450, "width": 1620, "height": 500, "fontSize": 36, "fontWeight": 400, "textAlign": "left", "lineHeight": 1.4}
        else: # Default/caption
            payload = {"x": 150, "y": 950, "width": 1620, "height": 50, "fontSize": 24, "fontWeight": 400, "textAlign": "left", "fontColor": "#888888"}
        
        payload.update({
            "id": f"text_{uuid.uuid4().hex[:8]}", "parentId": frame_id, "element_type": "text", "content": text,
        })
        
        element = self._workspace.create_element_from_payload(payload)
        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}

    async def _create_image_element(self, context: dict, frame_id: str, image_url: str, alt_text: str) -> dict:
        """
        Creates an image element on the canvas within a specified frame.
        """
        frame = self._workspace.elements.get(frame_id)
        if not frame:
            return {"status": "failed", "error": f"Frame {frame_id} not found."}

        # Simple implementation, places image in the center. Could be made smarter.
        payload = {
            "id": f"image_{uuid.uuid4().hex[:8]}",
            "parentId": frame_id,
            "element_type": "image",
            "x": (1920 - 800) / 2,
            "y": (1080 - 600) / 2,
            "width": 800,
            "height": 600,
            # --- THE FIX IS HERE ---
            # Change the key from "url" to "src" to match the ImageElement model.
            "src": image_url,
            "alt_text": alt_text
        }

        element = self._workspace.create_element_from_payload(payload)

        if not element:
            error_msg = f"Workspace failed to create image element with payload: {payload}"
            logger.error(error_msg)
            return {"status": "failed", "error": error_msg}

        context["commands"].append({"type": "ELEMENT_CREATED", "payload": element.model_dump()})
        return {"element_id": element.id, "status": "success"}
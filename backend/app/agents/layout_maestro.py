import json
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine, Literal

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService

class LayoutMaestro(Agent):
    """
    An autonomous agent that intelligently arranges, aligns, and distributes existing
    elements on the canvas by calculating new positions and issuing update commands.
    """
    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service

    @property
    def name(self) -> str: return "LayoutMaestro"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Arranges, aligns, and distributes existing elements based on a high-level layout objective (e.g., 'Align these left', 'Space these out evenly').",
            "input": "A natural language objective and a set of selected element IDs from the context.",
            "output": "A list of commands to update the positions of the specified elements.",
            "limitations": "Cannot create or delete elements. It only repositions existing ones."
        }

    @property
    def tools(self) -> List[Tool]:
        return [
            Tool(function={
                "name": "align_elements",
                "description": "Calculates new positions to align elements. Use for 'align left', 'center horizontally', 'align top', etc.",
                "parameters": {
                    "type": "object",
                    "properties": { "alignment": {"type": "string", "enum": ["left", "h_center", "right", "top", "v_center", "bottom"]} },
                    "required": ["alignment"]
                }
            }),
            Tool(function={
                "name": "distribute_elements_evenly",
                "description": "Distributes elements evenly between the outermost items. Use for 'space out evenly', 'distribute vertically'.",
                "parameters": {
                    "type": "object",
                    "properties": { "direction": {"type": "string", "enum": ["horizontal", "vertical"]} },
                    "required": ["direction"]
                }
            }),
            # --- THE NEW, MORE POWERFUL TOOL ---
            Tool(function={
                "name": "set_spacing_between_elements",
                "description": "Sets a specific pixel spacing between elements. Use for 'space by 50px', 'add 20px gap'.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "spacing": {"type": "number", "description": "The gap in pixels between each element."},
                        "direction": {"type": "string", "enum": ["horizontal", "vertical"], "description": "The direction to apply the spacing."}
                    },
                    "required": ["spacing", "direction"]
                }
            })
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        # Map tool names to the methods that contain the layout math.
        return {
            "align_elements": self._calculate_and_apply_alignment,
            "distribute_elements_evenly": self._calculate_and_apply_distribution, # Renamed
            "set_spacing_between_elements": self._calculate_and_apply_spacing, # New mapping
        }
    
    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]]
    ) -> Dict[str, Any]:
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")
        element_ids = context.get("selected_ids", [])
        if not element_ids or len(element_ids) < 2:
            return {"status": "failed", "error": "LayoutMaestro requires at least two selected elements."}
        
        # --- NEW SYSTEM PROMPT TO ALLOW MULTI-TOOL USE ---
        system_prompt = f"""
        You are a meticulous AI Layout Designer. Your job is to understand the user's complex layout objective and break it down into a sequence of tool calls to achieve the final result.

        **CRITICAL INSTRUCTIONS:**
        1.  **Decomposition:** Analyze the objective. If it contains multiple actions (e.g., "align left and space out"), you MUST make multiple, sequential tool calls.
        2.  **Tool Selection:** For each action, choose the most appropriate tool from your list.
            - For alignment, use `align_elements`.
            - for "space out evenly," use `distribute_elements_evenly`.
            - For specific pixel gaps (e.g., "50px apart"), you MUST use `set_spacing_between_elements`.
        3.  **Execute Sequentially:** Plan your calls in a logical order. For "align and space," you should align first, then space.
        
        Respond with one or more tool calls in a single response to execute your plan.
        """
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": objective}]

        try:
            # The tool-calling loop we already have naturally supports multi-tool responses,
            # so we don't need to change the loop itself, just the prompt.
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL, messages=messages,
                tools=[t.model_dump() for t in self.tools],
                # We can keep tool_choice="auto", but the new prompt encourages multiple calls if needed.
                temperature=0.0,
                api_key=settings.AZURE_API_KEY_TEXT,
                api_base=settings.AZURE_API_BASE_TEXT,
                api_version=settings.AZURE_API_VERSION_TEXT,
            )
            response_message = response.choices[0].message

            if not response_message.tool_calls:
                return {"status": "failed", "error": f"{self.name} could not determine a layout action from the objective."}

            # This loop will now correctly handle one or MORE tool calls from the LLM
            for tool_call in response_message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                tool_function = self.available_functions.get(tool_name)
                if not tool_function:
                    logger.error(f"LayoutMaestro received unimplemented tool call: {tool_name}")
                    continue # Skip to next tool call if one is bad

                await tool_function(context=context, element_ids=element_ids, **tool_args)
            
            return {"status": "success"}

        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {"status": "failed", "error": str(e)}

    # --- NEW: TOOL IMPLEMENTATIONS WITH ACTUAL MATH ---
    # These methods perform the calculations and update the context directly.

    async def _calculate_and_apply_alignment(self, context: dict, element_ids: List[str], alignment: str) -> None:
        elements = [self._workspace.elements.get(eid) for eid in element_ids if self._workspace.elements.get(eid)]
        if not elements: return

        if alignment == 'left':
            target_x = min(el.x for el in elements)
            for el in elements: el.x = target_x
        elif alignment == 'right':
            target_x = max(el.x + el.width for el in elements)
            for el in elements: el.x = target_x - el.width
        elif alignment == 'h_center':
            avg_center_x = sum(el.x + el.width / 2 for el in elements) / len(elements)
            for el in elements: el.x = avg_center_x - el.width / 2
        elif alignment == 'top':
            target_y = min(el.y for el in elements)
            for el in elements: el.y = target_y
        elif alignment == 'bottom':
            target_y = max(el.y + el.height for el in elements)
            for el in elements: el.y = target_y - el.height
        elif alignment == 'v_center':
            avg_center_y = sum(el.y + el.height / 2 for el in elements) / len(elements)
            for el in elements: el.y = avg_center_y - el.height / 2
        
        # Append a single command to the context to update all modified elements
        context["commands"].append({
            "type": "ELEMENTS_UPDATED",
            "payload": [el.model_dump() for el in elements]
        })

    async def _calculate_and_apply_distribution(self, context: dict, element_ids: List[str], direction: str) -> None:
        elements = [self._workspace.elements.get(eid) for eid in element_ids if self._workspace.elements.get(eid)]
        if len(elements) < 3: return # Distribution needs at least 3 elements

        if direction == 'horizontal':
            elements.sort(key=lambda el: el.x)
            left_bound = elements[0].x
            right_bound = elements[-1].x + elements[-1].width
            total_width = sum(el.width for el in elements)
            total_gap = (right_bound - left_bound) - total_width
            gap = total_gap / (len(elements) - 1)
            
            current_x = left_bound + elements[0].width
            for i in range(1, len(elements) - 1):
                elements[i].x = current_x + gap
                current_x += elements[i].width + gap
        
        elif direction == 'vertical':
            elements.sort(key=lambda el: el.y)
            top_bound = elements[0].y
            bottom_bound = elements[-1].y + elements[-1].height
            total_height = sum(el.height for el in elements)
            total_gap = (bottom_bound - top_bound) - total_height
            gap = total_gap / (len(elements) - 1)

            current_y = top_bound + elements[0].height
            for i in range(1, len(elements) - 1):
                elements[i].y = current_y + gap
                current_y += elements[i].height + gap

        context["commands"].append({
            "type": "ELEMENTS_UPDATED",
            "payload": [el.model_dump() for el in elements]
        })

    # --- THE NEW TOOL IMPLEMENTATION ---
    async def _calculate_and_apply_spacing(self, context: dict, element_ids: List[str], spacing: float, direction: str) -> None:
        elements = [self._workspace.elements.get(eid) for eid in element_ids if self._workspace.elements.get(eid)]
        if len(elements) < 2: return

        if direction == 'horizontal':
            elements.sort(key=lambda el: el.x)
            current_x = elements[0].x + elements[0].width
            for i in range(1, len(elements)):
                elements[i].x = current_x + spacing
                current_x += elements[i].width + spacing
        elif direction == 'vertical':
            elements.sort(key=lambda el: el.y)
            current_y = elements[0].y + elements[0].height
            for i in range(1, len(elements)):
                elements[i].y = current_y + spacing
                current_y += elements[i].height + spacing

        context["commands"].append({
            "type": "ELEMENTS_UPDATED",
            "payload": [el.model_dump() for el in elements]
        })
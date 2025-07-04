# parsec-backend/app/agents/shared_tools.py
from loguru import logger
from typing import List, Dict, Any, Tuple

from ..services.workspace_service import WorkspaceService
from ..models.elements import ShapeElement

# ==============================================================================
# 1. TOOL DEFINITIONS (for the LLM)
# These remain unchanged.
# ==============================================================================

GET_CANVAS_ELEMENTS_TOOL = {
    "type": "function",
    "function": {
        "name": "get_canvas_elements",
        "description": "Retrieves a list of all elements on the canvas, including their properties like position, size, and type. This should ALWAYS be the first step for any task involving existing elements.",
        "parameters": {"type": "object", "properties": {}},
    },
}

UPDATE_ELEMENTS_TOOL = {
    "type": "function",
    "function": {
        "name": "update_elements",
        "description": "Updates one or more elements on the canvas with new properties. This is the primary tool for moving, resizing, rotating, or changing the appearance of elements.",
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
                            "fill": {
                                "type": "object",
                                "description": "The fill style. Can be a solid color or a gradient.",
                                "properties": {
                                    "type": {"type": "string", "enum": ["solid", "linear-gradient"]},
                                    "color": {"type": "string", "description": "CSS color for solid fill."},
                                    "angle": {"type": "integer", "description": "Angle for gradient fill."},
                                    "stops": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "color": {"type": "string"},
                                                "offset": {"type": "number"},
                                            },
                                        },
                                    },
                                },
                            },
                            "stroke": {"type": "string"},
                            "strokeWidth": {"type": "number"},
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
}

# ==============================================================================
# 2. TOOL IMPLEMENTATION (for Python)
# ==============================================================================

class CommonCanvasTools:
    def __init__(self, workspace_service: WorkspaceService):
        self.workspace = workspace_service
        logger.info("CommonCanvasTools initialized.")

    def get_canvas_elements(self) -> List[Dict[str, Any]]:
        """Implementation for the get_canvas_elements tool."""
        logger.info("Executing shared tool: 'get_canvas_elements'")
        return self.workspace.get_all_elements()

    def update_elements(self, updates: List[Dict]) -> Tuple[Dict[str, Any], List[str]]:
        """
        Implementation for the update_elements tool.

        Returns:
            A tuple containing:
            - The command dictionary for the frontend.
            - A list of the IDs of the elements that were successfully updated.
        """
        logger.info(f"Executing shared tool: 'update_elements' with {len(updates)} update(s).")
        updated_elements_data = []
        affected_ids = []

        for update_data in updates:
            element_id = update_data.pop("id")
            
            if 'fill' in update_data and isinstance(update_data['fill'], str):
                update_data['fill'] = {"type": "solid", "color": update_data['fill']}

            updated = self.workspace.update_element(element_id, update_data)
            if updated:
                updated_elements_data.append(updated.model_dump())
                affected_ids.append(updated.id)
        
        command = {"type": "elements_updated", "payload": updated_elements_data}
        
        return command, affected_ids
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
GET_ELEMENTS_BY_ID_TOOL = {
    "type": "function",
    "function": {
        "name": "get_elements_by_id",
        "description": "Retrieves the full details for a specific list of element IDs. Use this when you have IDs and need to know more about those specific elements.",
        "parameters": {
            "type": "object",
            "properties": {
                "ids": {
                    "type": "array",
                    "description": "A list of the element IDs to retrieve.",
                    "items": {"type": "string"},
                }
            },
            "required": ["ids"],
        },
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

CREATE_ELEMENTS_TOOL = {
    "type": "function",
    "function": {
        "name": "create_elements",
        "description": "Creates one or more new elements on the canvas. Use this to add new shapes, text, or frames. This is the primary tool for generating content.",
        "parameters": {
            "type": "object",
            "properties": {
                "elements": {
                    "type": "array",
                    "description": "A list of new elements to create. Each element is an object defining its properties.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "element_type": {"type": "string", "enum": ["shape", "text", "frame"]}, # Added frame here
                            "x": {"type": "number"}, "y": {"type": "number"},
                            "width": {"type": "number"}, "height": {"type": "number"},
                            # --- THIS IS THE NEW PROPERTY ---
                            "parentId": {"type": "string", "description": "Optional. The ID of the frame or group this element should be placed inside."},
                            # --- END OF NEW PROPERTY ---
                            "shape_type": {"type": "string", "enum": ["rect", "ellipse"]},
                            "content": {"type": "string"},
                            "name": {"type": "string"},
                            "fill": { "type": "object", "properties": { "type": {"type": "string", "enum": ["solid"]}, "color": {"type": "string"}}}
                        },
                        "required": ["element_type", "x", "y", "width", "height"],
                    },
                }
            },
            "required": ["elements"],
        },
    },
}

GROUP_ELEMENTS_TOOL = {
    "type": "function",
    "function": {
        "name": "group_elements",
        "description": "Groups a list of existing elements together into a single, logical group.",
        "parameters": {
            "type": "object",
            "properties": {
                "ids": {
                    "type": "array",
                    "description": "A list of the element IDs to group.",
                    "items": {"type": "string"},
                }
            },
            "required": ["ids"],
        },
    },
}

CREATE_FRAME_TOOL = {
    "type": "function", "function": {
        "name": "create_frame",
        "description": "Creates a single Frame element on the canvas. A frame is a container for other elements.",
        "parameters": { "type": "object", "properties": {
                "name": {"type": "string"}, "x": {"type": "number"}, "y": {"type": "number"},
                "width": {"type": "number"}, "height": {"type": "number"}
            }, "required": ["name", "x", "y", "width", "height"]},
    }
}

CREATE_TEXT_ELEMENTS_TOOL = {
    "type": "function", "function": {
        "name": "create_text_elements",
        "description": "Creates one or more Text elements on the canvas, typically inside a parent frame.",
        "parameters": { "type": "object", "properties": {
                "parent_id": {"type": "string", "description": "The ID of the parent frame to place the text inside."},
                "text_items": { "type": "array", "items": { "type": "object", "properties": {
                            "content": {"type": "string"}, "x": {"type": "number"}, "y": {"type": "number"},
                            "width": {"type": "number"}, "font_size": {"type": "number"}, "name": {"type": "string"}
                        }, "required": ["content", "x", "y"]}}},
            "required": ["parent_id", "text_items"]},
    }
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
        
    def get_elements_by_id(self, ids: List[str]) -> List[Dict[str, Any]]:
        """
        Implementation for the get_elements_by_id tool.
        Returns a list of full element data for the given IDs.
        """
        logger.info(f"Executing shared tool: 'get_elements_by_id' for IDs: {ids}")
        elements = [
            self.workspace.elements.get(eid) for eid in ids if self.workspace.elements.get(eid)
        ]
        return [el.model_dump() for el in elements]

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

    def create_elements(self, elements: List[Dict]) -> Tuple[Dict[str, Any], List[str]]:
        """Implementation for the create_elements tool."""
        logger.info(f"Executing shared tool: 'create_elements' with {len(elements)} element(s).")
        
        created_elements = self.workspace.create_elements_batch(elements)
        if not created_elements:
            return {}, []
            
        command = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in created_elements]}
        affected_ids = [el.id for el in created_elements]
        
        return command, affected_ids

    def group_elements(self, ids: List[str]) -> Tuple[Dict[str, Any], List[str]]:
        """Implementation for the group_elements tool."""
        logger.info(f"Executing shared tool: 'group_elements' for IDs: {ids}")

        affected_elements = self.workspace.group_elements(ids)
        if not affected_elements:
            return {}, []
        
        command = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in affected_elements]}
        group_id = next((el.id for el in affected_elements if el.element_type == 'group'), None)
        
        return command, [group_id] if group_id else []

    def create_frame(self, name: str, x: float, y: float, width: float, height: float) -> Tuple[Dict[str, Any], List[str]]:
        """Implementation for the create_frame tool."""
        logger.info(f"Executing tool: 'create_frame' named '{name}'")
        payload = {"element_type": "frame", "name": name, "x": x, "y": y, "width": width, "height": height}
        element = self.workspace.create_element_from_payload(payload)
        if not element: return {}, []
        command = {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
        return command, [element.id]

    def create_text_elements(self, parent_id: str, text_items: List[Dict]) -> Tuple[Dict[str, Any], List[str]]:
        """Implementation for the create_text_elements tool."""
        logger.info(f"Executing tool: 'create_text_elements' for parent {parent_id}")
        payloads = []
        for item in text_items:
            payloads.append({
                "element_type": "text", "parentId": parent_id,
                "content": item.get("content"), "x": item.get("x"), "y": item.get("y"),
                "width": item.get("width", 500), "fontSize": item.get("font_size", 24),
                "name": item.get("name")
            })
        elements = self.workspace.create_elements_batch(payloads)
        if not elements: return {}, []
        command = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
        return command, [el.id for el in elements]
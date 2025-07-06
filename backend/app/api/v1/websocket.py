# parsec-backend/app/api/v1/websocket.py
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List, Dict
from loguru import logger

from ...services.workspace_service import WorkspaceService
from ...agents.base_agent import BaseAgent
from ...agents.content_strategist import ContentStrategist
from ...agents.main_agent import MainAgent
from ...agents.canvas_agent import CanvasAgent
from ...agents.image_genius import ImageGenius
from ...agents.layout_maestro import LayoutMaestro
from ...agents.component_crafter import ComponentCrafter
from ...agents.shared_tools import CommonCanvasTools
from ...agents.visual_designer import VisualDesigner

router = APIRouter()

class ConnectionManager:
    def __init__(self): self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket): await websocket.accept(); self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections: self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        if not self.active_connections: return
        tasks = [conn.send_text(message) for conn in self.active_connections]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception): logger.warning(f"Failed to send message to a closing client: {result}")


manager = ConnectionManager()

# --- Dependency Injection Setup (This is correct) ---
_workspace_service = WorkspaceService()
_common_tools = CommonCanvasTools(workspace_service=_workspace_service)

# Create a dictionary to hold all agents
agent_pouch: Dict[str, BaseAgent] = {}
common_args = {"common_tools": _common_tools}

# Instantiate each specialist
agent_pouch["ContentStrategist"] = ContentStrategist(**common_args)
agent_pouch["VisualDesigner"] = VisualDesigner(**common_args)
agent_pouch["LayoutMaestro"] = LayoutMaestro(**common_args)
agent_pouch["CanvasAgent"] = CanvasAgent(**common_args)
agent_pouch["ImageGenius"] = ImageGenius(workspace_service=_workspace_service, **common_args)
agent_pouch["ComponentCrafter"] = ComponentCrafter(workspace_service=_workspace_service, **common_args)
# Add MainAgent last
agent_pouch["MainAgent"] = MainAgent(**common_args)

# Give every agent a reference to all its peers
for agent in agent_pouch.values():
    agent.set_agent_pouch(agent_pouch)

def get_main_agent() -> MainAgent:
    return agent_pouch["MainAgent"]

def get_workspace_service() -> WorkspaceService: return _workspace_service


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    agent: MainAgent = Depends(get_main_agent),
    workspace: WorkspaceService = Depends(get_workspace_service),
):
    await manager.connect(websocket)
    client_host = websocket.client.host
    client_port = websocket.client.port
    logger.info(f"Client connected: {client_host}:{client_port}")

    try:
        # Send the full initial state, including component definitions
        initial_state = {
            "type": "SET_WORKSPACE_STATE",
            "payload": {
                "elements": workspace.get_all_elements(),
                "componentDefinitions": workspace.get_all_component_definitions()
            }
        }
        await websocket.send_text(json.dumps(initial_state))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.debug(f"Received message from {client_host}:{client_port}: {message}")
            msg_type = message.get("type")
            payload = message.get("payload", {}) # Use .get with a default to prevent KeyErrors

            response = None # We will build a single response object to broadcast at the end

            if msg_type == "user_prompt":
                commands = await agent.process_prompt(payload.get("text"), payload.get("selected_ids"))
                for command in commands:
                    if command: await manager.broadcast(json.dumps(command))
                continue # Skip the single response broadcast

            # === HISTORY COMMANDS ===
            elif msg_type == "undo":
                restored_elements = workspace.undo()
                if restored_elements is not None:
                    response = {
                        "type": "WORKSPACE_RESET",
                        "payload": {"elements": [el.model_dump() for el in restored_elements.values()]}
                    }
            elif msg_type == "redo":
                restored_elements = workspace.redo()
                if restored_elements is not None:
                    response = {
                        "type": "WORKSPACE_RESET",
                        "payload": {"elements": [el.model_dump() for el in restored_elements.values()]}
                    }

            # === ELEMENT MODIFICATION COMMANDS ===
            elif msg_type == "update_element":
                commit_history = payload.pop("commitHistory", True) # For debouncing
                element = workspace.update_element(payload["id"], payload, commit_history=commit_history)
                if element: response = {"type": "ELEMENT_UPDATED", "payload": element.model_dump()}
            
            elif msg_type == "create_element":
                element = workspace.create_element_from_payload(payload)
                if element: response = {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
            
            elif msg_type == "create_elements_batch":
                elements = workspace.create_elements_batch(payload.get("elements", []))
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "delete_element":
                deleted_ids = workspace.delete_element(payload["id"])
                for an_id in deleted_ids:
                    await manager.broadcast(json.dumps({"type": "ELEMENT_DELETED", "payload": {"id": an_id}}))
                continue
            
            # === HIERARCHY & ORDERING COMMANDS ===
            elif msg_type == "group_elements":
                elements = workspace.group_elements(payload["ids"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "ungroup_element":
                children, deleted_ids = workspace.ungroup_elements(payload["id"])
                # First, broadcast the updates to the children that were released.
                if children: await manager.broadcast(json.dumps({"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in children]}))
                # Then, broadcast the deletion of the container group/frame.
                for an_id in deleted_ids: await manager.broadcast(json.dumps({"type": "ELEMENT_DELETED", "payload": {"id": an_id}}))
                continue
            
            elif msg_type == "reparent_element":
                elements = workspace.reparent_element(payload["childId"], payload["newParentId"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "reorder_element":
                elements = workspace.reorder_element(payload["id"], payload["command"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}

            # === PRESENTATION COMMANDS ===
            elif msg_type == "update_presentation_order":
                elements = workspace.update_presentation_order(payload)
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "reorder_slide":
                slides = workspace.reorder_slide(payload["dragged_id"], payload["target_id"], payload["position"])
                if slides: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in slides]}
            
            # --- BROADCAST THE FINAL RESPONSE ---
            if response:
                await manager.broadcast(json.dumps(response))

    except WebSocketDisconnect:
        logger.info(f"Client disconnected cleanly: {client_host}:{client_port}")
    except Exception as e:
        logger.error(f"An unexpected error occurred with client {client_host}:{client_port}: {e}", exc_info=True)
    finally:
        manager.disconnect(websocket)
        logger.info(f"Connection closed and cleaned up for: {client_host}:{client_port}")
# parsec-backend/app/api/v1/websocket.py
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List
from loguru import logger

from ...services.workspace_service import WorkspaceService
from ...agents.main_agent import MainAgent
from ...agents.canvas_agent import CanvasAgent
from ...agents.image_genius import ImageGenius
from ...agents.layout_maestro import LayoutMaestro
from ...agents.component_crafter import ComponentCrafter
from ...agents.shared_tools import CommonCanvasTools

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
_canvas_agent = CanvasAgent(workspace_service=_workspace_service, common_tools=_common_tools)
_image_genius = ImageGenius(workspace_service=_workspace_service)
_layout_maestro = LayoutMaestro(common_tools=_common_tools)
_component_crafter = ComponentCrafter(workspace_service=_workspace_service, common_tools=_common_tools)
_main_agent = MainAgent(
    canvas_agent=_canvas_agent,
    image_agent=_image_genius,
    layout_agent=_layout_maestro,
    component_agent=_component_crafter,
)

def get_main_agent() -> MainAgent: return _main_agent
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
            payload = message.get("payload")

            response = None # We will build the response object here

            if msg_type == "user_prompt":
                # User prompt is a special case with multiple potential commands
                commands = await agent.process_prompt(payload["text"], payload.get("selected_ids"))
                for command in commands:
                    if command: await manager.broadcast(json.dumps(command))
                continue # Skip the single response broadcast at the end

            # --- DETERMINISTIC HANDLERS ---
            elif msg_type == "update_element":
                element = workspace.update_element(payload["id"], payload)
                if element: response = {"type": "ELEMENT_UPDATED", "payload": element.model_dump()}
            
            elif msg_type == "group_elements":
                elements = workspace.group_elements(payload["ids"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "ungroup_element":
                group_id = payload["id"]
                children = workspace.ungroup_elements(group_id)
                if children: await manager.broadcast(json.dumps({"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in children]}))
                await manager.broadcast(json.dumps({"type": "ELEMENT_DELETED", "payload": {"id": group_id}}))
                continue
            
            elif msg_type == "reorder_element":
                elements = workspace.reorder_element(payload["id"], payload["command"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "create_element":
                element = workspace.create_element_from_payload(payload)
                if element: response = {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
            
            elif msg_type == "reparent_element":
                elements = workspace.reparent_element(payload["childId"], payload["newParentId"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "delete_element":
                deleted_ids = workspace.delete_element(payload["id"])
                for an_id in deleted_ids: await manager.broadcast(json.dumps({"type": "ELEMENT_DELETED", "payload": {"id": an_id}}))
                continue

            elif msg_type == "reorder_layer":
                elements = workspace.reorder_layer(payload["draggedId"], payload["targetId"], payload["position"])
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}

            elif msg_type == "update_presentation_order":
                elements = workspace.update_presentation_order(payload)
                if elements: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in elements]}
            
            elif msg_type == "reorder_slide":
                slides = workspace.reorder_slide(payload["dragged_id"], payload["target_id"], payload["position"])
                if slides: response = {"type": "ELEMENTS_UPDATED", "payload": [el.model_dump() for el in slides]}
            
            if response:
                await manager.broadcast(json.dumps(response))

    except WebSocketDisconnect:
        logger.info(f"Client disconnected cleanly: {client_host}:{client_port}")
    except Exception as e:
        logger.error(f"An unexpected error occurred with client {client_host}:{client_port}: {e}")
    finally:
        manager.disconnect(websocket)
        logger.info(f"Connection closed and cleaned up for: {client_host}:{client_port}")
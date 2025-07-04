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
from ...agents.layout_maestro import LayoutMaestro  # <-- IMPORT 1
from ...agents.shared_tools import CommonCanvasTools  # <-- IMPORT 2

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        """Broadcasts a message to all active WebSocket connections concurrently."""
        if not self.active_connections:
            return
        tasks = [conn.send_text(message) for conn in self.active_connections]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Failed to send message to a closing client: {result}")


manager = ConnectionManager()

# --- Dependency Injection Setup with Agent Hierarchy ---
# 1. Create the foundational services and tools
_workspace_service = WorkspaceService()
_common_tools = CommonCanvasTools(workspace_service=_workspace_service)

# 2. Create the specialist agents, providing them with necessary dependencies
_canvas_agent = CanvasAgent(workspace_service=_workspace_service, common_tools=_common_tools)
_image_genius = ImageGenius(workspace_service=_workspace_service)
_layout_maestro = LayoutMaestro(common_tools=_common_tools) # <-- INSTANTIATE

# 3. Create the main orchestrator agent, providing it with all specialists
_main_agent = MainAgent(
    canvas_agent=_canvas_agent,
    image_agent=_image_genius,
    layout_agent=_layout_maestro, # <-- PROVIDE TO MAIN AGENT
)


def get_main_agent() -> MainAgent:
    return _main_agent


def get_workspace_service() -> WorkspaceService:
    return _workspace_service


# --------------------------------------------------------


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
        initial_state = { "type": "workspace_state", "payload": workspace.get_all_elements() }
        await websocket.send_text(json.dumps(initial_state))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.debug(f"Received message from {client_host}:{client_port}: {message}")
            msg_type = message.get("type")
            payload = message.get("payload")

            if msg_type == "user_prompt":
                commands = await agent.process_prompt(payload["text"], payload.get("selected_ids"))
                for command in commands:
                    if command:
                        await manager.broadcast(json.dumps(command))

            # --- All other deterministic handlers remain the same ---
            elif msg_type == "update_element":
                updated_element = workspace.update_element(payload["id"], payload)
                if updated_element:
                    response = { "type": "element_updated", "payload": updated_element.model_dump() }
                    await manager.broadcast(json.dumps(response))
            elif msg_type == "group_elements":
                affected_elements = workspace.group_elements(payload["ids"])
                if affected_elements:
                    update_command = { "type": "elements_updated", "payload": [el.model_dump() for el in affected_elements] }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "ungroup_element":
                group_id_to_delete = payload["id"]
                affected_children = workspace.ungroup_elements(group_id_to_delete)
                delete_command = { "type": "element_deleted", "payload": {"id": group_id_to_delete} }
                if affected_children:
                    update_command = { "type": "elements_updated", "payload": [el.model_dump() for el in affected_children] }
                    await manager.broadcast(json.dumps(update_command))
                await manager.broadcast(json.dumps(delete_command))
            elif msg_type == "reorder_element":
                affected_elements = workspace.reorder_element(payload["id"], payload["command"])
                if affected_elements:
                    update_command = { "type": "elements_updated", "payload": [el.model_dump() for el in affected_elements] }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "create_element":
                new_element = workspace.create_element_from_payload(payload)
                if new_element:
                    response = {"type": "element_created", "payload": new_element.model_dump()}
                    await manager.broadcast(json.dumps(response))
            elif msg_type == "reparent_element":
                affected_elements = workspace.reparent_element(payload["childId"], payload["newParentId"])
                if affected_elements:
                    update_command = { "type": "elements_updated", "payload": [el.model_dump() for el in affected_elements] }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "delete_element":
                deleted_ids = workspace.delete_element(payload["id"])
                for an_id in deleted_ids:
                    delete_command = { "type": "element_deleted", "payload": {"id": an_id} }
                    await manager.broadcast(json.dumps(delete_command))
            elif msg_type == "reorder_layer":
                affected_elements = workspace.reorder_layer(payload["draggedId"], payload["targetId"], payload["position"])
                if affected_elements:
                    update_command = { "type": "elements_updated", "payload": [el.model_dump() for el in affected_elements] }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "update_path_point":
                updated_element = workspace.update_path_point(payload["id"], payload["index"], payload["x"], payload["y"])
                if updated_element:
                    response = { "type": "element_updated", "payload": updated_element.model_dump() }
                    await manager.broadcast(json.dumps(response))

    except WebSocketDisconnect:
        logger.info(f"Client disconnected cleanly: {client_host}:{client_port}")
    except Exception as e:
        logger.error(f"An unexpected error occurred with client {client_host}:{client_port}: {e}")
    finally:
        manager.disconnect(websocket)
        logger.info(f"Connection closed and cleaned up for: {client_host}:{client_port}")
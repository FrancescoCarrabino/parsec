# parsec-backend/app/api/v1/websocket.py
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List
from loguru import logger

from ...services.workspace_service import WorkspaceService
from ...agents.main_agent import MainAgent
from ...agents.canvas_agent import CanvasAgent
from ...agents.image_genius import ImageGenius # <-- IMPORT NEW AGENT

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

        tasks = [
            connection.send_text(message) for connection in self.active_connections
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Failed to send message to a closing client: {result}")


manager = ConnectionManager()

# --- Dependency Injection Setup with Agent Hierarchy ---
_workspace_service = WorkspaceService()
_canvas_agent = CanvasAgent(workspace_service=_workspace_service)
_image_genius = ImageGenius(workspace_service=_workspace_service) # <-- INSTANTIATE
_main_agent = MainAgent(
    canvas_agent=_canvas_agent,
    image_agent=_image_genius # <-- PROVIDE TO MAIN AGENT
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
        initial_state = {
            "type": "workspace_state",
            "payload": workspace.get_all_elements(),
        }
        await websocket.send_text(json.dumps(initial_state))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.debug(
                f"Received message from {client_host}:{client_port}: {message}"
            )
            msg_type = message.get("type")
            payload = message.get("payload")

            if msg_type == "user_prompt":
                # MainAgent now returns a list of commands, which could be empty
                commands = await agent.process_prompt(
                    payload["text"], payload.get("selected_ids")
                )
                for command in commands:
                    # Ensure command is not empty before broadcasting
                    if command:
                        await manager.broadcast(json.dumps(command))

            elif msg_type == "update_element":
                updated_element = workspace.update_element(payload["id"], payload)
                if updated_element:
                    response = {
                        "type": "element_updated",
                        "payload": updated_element.model_dump(),
                    }
                    await manager.broadcast(json.dumps(response))

            elif msg_type == "group_elements":
                logger.info(f"Received direct command to group IDs: {payload['ids']}")
                affected_elements = workspace.group_elements(payload["ids"])
                if affected_elements:
                    update_command = {
                        "type": "elements_updated",
                        "payload": [el.model_dump() for el in affected_elements],
                    }
                    await manager.broadcast(json.dumps(update_command))

            elif msg_type == "ungroup_element":
                logger.info(f"Received direct command to ungroup: {payload['id']}")
                group_id_to_delete = payload["id"]
                affected_children = workspace.ungroup_elements(group_id_to_delete)

                delete_command = {
                    "type": "element_deleted",
                    "payload": {"id": group_id_to_delete},
                }
                if affected_children:
                    update_command = {
                        "type": "elements_updated",
                        "payload": [el.model_dump() for el in affected_children],
                    }
                    await manager.broadcast(json.dumps(update_command))
                await manager.broadcast(json.dumps(delete_command))

            elif msg_type == "reorder_element":
                logger.info(
                    f"Received direct command to reorder {payload['id']} with command {payload['command']}"
                )
                affected_elements = workspace.reorder_element(
                    payload["id"], payload["command"]
                )
                if affected_elements:
                    update_command = {
                        "type": "elements_updated",
                        "payload": [el.model_dump() for el in affected_elements],
                    }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "create_element":
                logger.info(f"Received direct command to create element: {payload}")
                new_element = workspace.create_element_from_payload(payload)
                if new_element:
                    element_data = new_element.model_dump()
                    response = {"type": "element_created", "payload": element_data}
                    await manager.broadcast(json.dumps(response))
                else:
                    logger.warning(
                        "Element creation returned None, nothing to broadcast."
                    )

            elif msg_type == "reparent_element":
                logger.info(
                    f"Received direct command to reparent {payload['childId']} to {payload['newParentId']}"
                )
                affected_elements = workspace.reparent_element(
                    payload["childId"], payload["newParentId"]
                )
                if affected_elements:
                    update_command = {
                        "type": "elements_updated",
                        "payload": [el.model_dump() for el in affected_elements],
                    }
                    await manager.broadcast(json.dumps(update_command))
            elif msg_type == "delete_element":
                logger.info(
                    f"Received direct command to delete element: {payload['id']}"
                )
                deleted_ids = workspace.delete_element(payload["id"])
                for an_id in deleted_ids:
                    delete_command = {
                        "type": "element_deleted",
                        "payload": {"id": an_id},
                    }
                    await manager.broadcast(json.dumps(delete_command))
            elif msg_type == "reorder_layer":
                logger.info(
                    f"Received command to reorder layer {payload['draggedId']} relative to {payload['targetId']}"
                )
                affected_elements = workspace.reorder_layer(
                    payload["draggedId"], payload["targetId"], payload["position"]
                )
                if affected_elements:
                    update_command = {
                        "type": "elements_updated",
                        "payload": [el.model_dump() for el in affected_elements],
                    }
                    await manager.broadcast(json.dumps(update_command))

            elif msg_type == "update_path_point":
                updated_element = workspace.update_path_point(
                    payload["id"], payload["index"], payload["x"], payload["y"]
                )
                if updated_element:
                    response = {
                        "type": "element_updated",
                        "payload": updated_element.model_dump(),
                    }
                    await manager.broadcast(json.dumps(response))
    except WebSocketDisconnect:
        logger.info(f"Client disconnected cleanly: {client_host}:{client_port}")
    except Exception as e:
        logger.error(
            f"An unexpected error occurred with client {client_host}:{client_port}: {e}"
        )
    finally:
        manager.disconnect(websocket)
        logger.info(
            f"Connection closed and cleaned up for: {client_host}:{client_port}"
        )
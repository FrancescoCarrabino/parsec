import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List, Dict, Any
from loguru import logger

from ...services.workspace_service import WorkspaceService
from ...services.agent_service import AgentService
from .dependencies import get_workspace_service, get_agent_service

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        if not self.active_connections:
            return
        results = await asyncio.gather(
            *(conn.send_text(message) for conn in self.active_connections),
            return_exceptions=True,
        )
        for res in results:
            if isinstance(res, Exception):
                logger.warning(f"Failed to send message to a client: {res}")


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    workspace: WorkspaceService = Depends(get_workspace_service),
    agent_service: AgentService = Depends(get_agent_service),
):
    await manager.connect(websocket)
    client_host = websocket.client.host
    client_port = websocket.client.port
    logger.info(f"Client connected: {client_host}:{client_port}")

    # --- This `send_status_update` closure is the key communicator ---
    async def send_update_to_client(status, message, details=None):
        """A closure that captures the current websocket to send messages."""
        payload = {"type": status, "payload": {"message": message}}
        if details is not None:
            payload["payload"].update(details)
        await websocket.send_text(json.dumps(payload))

    try:
        # Send initial state
        initial_state = {
            "type": "SET_WORKSPACE_STATE",
            "payload": {
                "elements": workspace.get_all_elements(),
                "componentDefinitions": workspace.get_all_component_definitions(),
                "assets": workspace.get_all_assets(),
            },
        }
        await websocket.send_text(json.dumps(initial_state))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.debug(f"Received message: {message}")
            msg_type = message.get("type")
            payload = message.get("payload", {})
            response = None  # Reset response for each message

            # --- ONE-SHOT AI PROMPT ---
            if msg_type == "user_prompt":
                commands = await agent_service.process_user_prompt(
                    prompt_text=payload.get("text"),
                    # Your frontend doesn't send selected_ids here, so we default to []
                    selected_ids=payload.get("selected_ids", []),
                    send_update_to_client=send_update_to_client,
                )
                for command in commands:
                    if command:
                        await manager.broadcast(json.dumps(command))
                continue

            # --- START OF NEW INTERACTIVE ANALYSIS LOGIC ---
            elif msg_type == "start_analysis_session":
                # This will start the agent task in the background. It does not block.
                # The agent will use `send_update_to_client` to communicate.
                asyncio.create_task(
                    agent_service.start_interactive_analysis_task(
                        prompt_text=payload.get("text"),
                        send_update_to_client=send_update_to_client,
                        websocket=websocket
                    )
                )
                continue  # No immediate response to broadcast

            elif msg_type == "analysis_message":
                # Forward the user's chat message to the running agent task
                await agent_service.forward_message_to_session(
                    session_id=payload.get("session_id"),
                    message_text=payload.get("text"),
                )
                continue  # No response to broadcast
            # --- END OF NEW INTERACTIVE ANALYSIS LOGIC ---

            # === HISTORY COMMANDS ===
            elif msg_type == "undo":
                restored_elements = workspace.undo()
                if restored_elements is not None:
                    response = {
                        "type": "WORKSPACE_RESET",
                        "payload": {
                            "elements": [
                                el.model_dump() for el in restored_elements.values()
                            ]
                        },
                    }
            elif msg_type == "redo":
                restored_elements = workspace.redo()
                if restored_elements is not None:
                    response = {
                        "type": "WORKSPACE_RESET",
                        "payload": {
                            "elements": [
                                el.model_dump() for el in restored_elements.values()
                            ]
                        },
                    }

            # === ELEMENT MODIFICATION COMMANDS ===
            elif msg_type == "update_element":
                commit_history = payload.pop("commitHistory", True)
                element = workspace.update_element(
                    payload["id"], payload, commit_history=commit_history
                )
                if element:
                    response = {
                        "type": "ELEMENT_UPDATED",
                        "payload": element.model_dump(),
                    }

            elif msg_type == "create_element":
                element = workspace.create_element_from_payload(payload)
                if element:
                    response = {
                        "type": "ELEMENT_CREATED",
                        "payload": element.model_dump(),
                    }

            elif msg_type == "create_elements_batch":
                elements = workspace.create_elements_batch(payload.get("elements", []))
                if elements:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in elements],
                    }

            elif msg_type == "delete_element":
                deleted_ids = workspace.delete_element(payload["id"])
                for an_id in deleted_ids:
                    await manager.broadcast(
                        json.dumps(
                            {"type": "ELEMENT_DELETED", "payload": {"id": an_id}}
                        )
                    )
                continue

            # === HIERARCHY & ORDERING COMMANDS ===
            elif msg_type == "group_elements":
                elements = workspace.group_elements(payload["ids"])
                if elements:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in elements],
                    }

            elif msg_type == "ungroup_element":
                children, deleted_ids = workspace.ungroup_elements(payload["id"])
                if children:
                    await manager.broadcast(
                        json.dumps(
                            {
                                "type": "ELEMENTS_UPDATED",
                                "payload": [el.model_dump() for el in children],
                            }
                        )
                    )
                for an_id in deleted_ids:
                    await manager.broadcast(
                        json.dumps(
                            {"type": "ELEMENT_DELETED", "payload": {"id": an_id}}
                        )
                    )
                continue

            elif msg_type == "reparent_element":
                elements = workspace.reparent_element(
                    payload["childId"], payload["newParentId"]
                )
                if elements:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in elements],
                    }

            elif msg_type == "reorder_element":
                elements = workspace.reorder_element(payload["id"], payload["command"])
                if elements:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in elements],
                    }

            # === PRESENTATION COMMANDS ===
            elif msg_type == "update_presentation_order":
                elements = workspace.update_presentation_order(payload)
                if elements:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in elements],
                    }

            elif msg_type == "reorder_slide":
                slides = workspace.reorder_slide(
                    payload["dragged_id"], payload["target_id"], payload["position"]
                )
                if slides:
                    response = {
                        "type": "ELEMENTS_UPDATED",
                        "payload": [el.model_dump() for el in slides],
                    }

            if response:
                await manager.broadcast(json.dumps(response))

    except WebSocketDisconnect:
        logger.info(f"Client disconnected cleanly: {client_host}:{client_port}")
    except Exception as e:
        logger.error(
            f"An unexpected error occurred with client {client_host}:{client_port}: {e}",
            exc_info=True,
        )
    finally:
        # On disconnect, we must ensure any running tasks for this client are cancelled.
        await agent_service.cleanup_client_sessions(websocket)
        manager.disconnect(websocket)
        logger.info(
            f"Connection closed and cleaned up for: {client_host}:{client_port}"
        )

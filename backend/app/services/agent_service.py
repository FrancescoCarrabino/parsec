import json
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine
import asyncio
import uuid
from fastapi import WebSocket

from ..agents.registry import AgentRegistry
from ..agents.orchestrator_agent import OrchestratorAgent
from ..agents.web_content_fetcher import WebContentFetcher
from ..agents.content_crafter import ContentCrafter
from ..agents.canvas_agent import CanvasAgent
from ..agents.image_genius import ImageGenius
from ..agents.layout_maestro import LayoutMaestro
from ..agents.slide_designer import SlideDesigner
from ..agents.component_crafter import ComponentCrafter
from ..agents.frontend_architect import FrontendArchitect
from ..agents.data_analyst_agent import DataAnalystAgent

from .workspace_service import WorkspaceService
from .storage_service import StorageService


async def _do_nothing_sender(status: str, message: str, details: Dict = None):
    pass


class AgentService:
    def __init__(self, workspace_service: WorkspaceService):
        logger.info("Assembling Agentic System...")
        self.workspace_service = workspace_service
        storage_service = StorageService()
        self.agent_registry = AgentRegistry()
        list_of_agents_to_register = [
            DataAnalystAgent(
                workspace_service=self.workspace_service,
                storage_service=storage_service,
            ),
            WebContentFetcher(),
            ContentCrafter(),
            CanvasAgent(workspace_service=self.workspace_service),
            ImageGenius(),
            LayoutMaestro(workspace_service=self.workspace_service),
            SlideDesigner(workspace_service=self.workspace_service),
            ComponentCrafter(workspace_service=self.workspace_service),
            FrontendArchitect(workspace_service=self.workspace_service),
        ]
        for agent in list_of_agents_to_register:
            self.agent_registry.register_agent(agent)
        self.orchestrator = OrchestratorAgent(self.agent_registry)
        self.active_interactive_tasks: Dict[str, asyncio.Task] = {}
        self.message_queues: Dict[str, asyncio.Queue] = {}
        self.session_owner: Dict[str, WebSocket] = {}
        logger.info("AgentService ready to manage interactive sessions.")
        logger.success("Agentic System Assembled.")

    # --- MODIFIED: _invoke_agent_as_tool now explicitly accepts send_status_update ---
    async def _invoke_agent_as_tool(
        self,
        agent_name: str,
        objective: str,
        context: Dict[str, Any],
        propagated_send_status_update: Callable,
    ) -> Any:
        logger.info(
            f"--- Sub-Task Invocation: Agent '{agent_name}' called with objective: '{objective}' ---"
        )
        agent_to_invoke = self.agent_registry.get_agent(agent_name)
        if not agent_to_invoke:
            error_msg = f"Attempted to invoke non-existent agent: {agent_name}"
            logger.error(error_msg)
            return {"error": error_msg}

        # Recursively call the agent's run_task.
        # It needs to provide a new 'invoke_agent' callable for the next level down.
        # This new callable must also correctly propagate 'propagated_send_status_update'.
        next_level_invoker = lambda an, obj, ctx: self._invoke_agent_as_tool(
            an, obj, ctx, propagated_send_status_update
        )

        return await agent_to_invoke.run_task(
            objective=objective,
            context=context,
            invoke_agent=next_level_invoker,  # Pass the correctly curried invoker
            send_status_update=propagated_send_status_update,  # Pass the sender directly to run_task
        )

    async def process_user_prompt(
        self,
        prompt_text: str,
        selected_ids: List[str],
        send_update_to_client: Callable[[Dict], Coroutine[Any, Any, None]]
    ) -> List[Dict[str, Any]]:

        workflow_failed = False
        workflow_context = {
            "original_prompt": prompt_text,
            "selected_ids": selected_ids,
            "history": [],
            "commands": [],
        }

        try:
            await send_update_to_client("STARTED", "Workflow started...")

            plan = await self.orchestrator.create_plan(
                prompt_text, selected_ids, send_status_update=send_update_to_client
            )

            if not plan.tasks:
                workflow_failed = True
                await send_update_to_client(
                    "FAILED", "I couldn't create a plan for that request."
                )
                return []

            await send_update_to_client(
                "PLAN_CREATED", f"Plan ready with {len(plan.tasks)} step(s). Let's go!"
            )

            for i, task in enumerate(plan.tasks):
                agent_name, objective = task.get("agent_name"), task.get("objective")
                status_message = (
                    f"Step {i+1}/{len(plan.tasks)}: Asking the {agent_name} to work..."
                )
                await send_update_to_client(
                    "EXECUTING_TASK",
                    status_message,
                    {
                        "task_number": i + 1,
                        "total_tasks": len(plan.tasks),
                        "agent_name": agent_name,
                    },
                )

                specialist = self.agent_registry.get_agent(agent_name)
                if not specialist:
                    workflow_failed = True
                    await send_update_to_client(
                        "ERROR", f"Could not find a required specialist: {agent_name}"
                    )
                    break

                # --- THIS IS THE CRITICAL CHANGE IN THE LAMBDA ---
                # It must pass send_status_update into _invoke_agent_as_tool correctly.
                invoker_for_specialist = (
                    lambda an, obj, ctx: self._invoke_agent_as_tool(
                        an, obj, ctx, send_status_update
                    )
                )

                task_result = await specialist.run_task(
                    objective=objective,
                    context=workflow_context,
                    invoke_agent=invoker_for_specialist,  # Pass this correctly formed invoker
                    send_status_update=send_update_to_client,  # This passes the *current* send_status_update to the specialist's run_task method.
                )

                workflow_context["history"].append(
                    {"task": objective, "agent": agent_name, "result": task_result}
                )

                if (
                    isinstance(task_result, dict)
                    and task_result.get("status") == "failed"
                ):
                    error_msg = task_result.get("error", "An agent reported a failure.")
                    logger.error(f"Task {i+1} failed: {error_msg}. Stopping workflow.")
                    await send_update_to_client("ERROR", f"Step {i+1} failed: {error_msg}")
                    workflow_failed = True
                    break

        except Exception as e:
            logger.exception("A critical error occurred during agent workflow.")
            await send_update_to_client("ERROR", f"A critical error occurred: {e}")
            workflow_failed = True

        finally:
            if not workflow_failed:
                await send_update_to_client("COMPLETED", "All done! Applying changes.")
                logger.info(
                    f"Workflow finished successfully. Collected {len(workflow_context['commands'])} commands."
                )
                if workflow_context["commands"]:
                    self.workspace_service._commit_history()
            else:
                logger.warning(
                    "Workflow finished with errors. No changes will be committed."
                )
                await send_update_to_client("FAILED", "Workflow aborted due to an error.")

        return [] if workflow_failed else workflow_context.get("commands", [])

    async def start_interactive_analysis_task(
        self,
        prompt_text: str,
        send_update_to_client: Callable[[Dict], Coroutine[Any, Any, None]],
        websocket: WebSocket # <-- Pass the websocket object itself for tracking
    ):
        logger.info(f"Request to start interactive analysis for prompt: '{prompt_text}'")
        
        # We don't need the orchestrator here, as the user has explicitly
        # chosen an analysis action from the frontend context menu.
        data_analyst_agent = self.agent_registry.get_agent('DataAnalystAgent')
        message_queue = asyncio.Queue()
        
        workflow_context = {
            "message_queue": message_queue,
            "original_prompt": prompt_text,
            "agent_service_ref": self,
            "websocket": websocket, # The agent needs this to track ownership
        }

        # Create and run the agent task in the background
        asyncio.create_task(
            data_analyst_agent.run_task(
                objective=prompt_text, # The agent will parse the asset ID from this
                context=workflow_context,
                invoke_agent=None,
                send_update_to_client=send_update_to_client # Pass the powerful sender
            )
        )

    def register_interactive_session(self, session_id: str, websocket: WebSocket, task: asyncio.Task, queue: asyncio.Queue):
        logger.info(f"Registering new interactive session: {session_id} for client {websocket.client.host}")
        self.active_interactive_tasks[session_id] = task
        self.message_queues[session_id] = queue
        self.session_owner[session_id] = websocket
        task.add_done_callback(lambda t: self._cleanup_interactive_session(session_id))

    # --- NEW METHOD: To forward messages to a running session ---
    async def forward_message_to_session(self, session_id: str, message_text: str):
        """Finds the message queue and puts the user's message into it."""
        if session_id in self.message_queues:
            logger.info(f"Forwarding message to session '{session_id}'")
            await self.message_queues[session_id].put(message_text)
        else:
            logger.warning(
                f"Received message for non-existent or finished session '{session_id}'"
            )
            
    def _cleanup_interactive_session(self, session_id: str):
        """Callback to clean up resources once an agent task finishes."""
        logger.info(f"Cleaning up resources for finished session '{session_id}'.")
        task = self.active_interactive_tasks.pop(session_id, None)
        self.message_queues.pop(session_id, None)
        owner = self.session_owner.pop(session_id, None)

        if task and task.done() and task.exception():
             logger.error(f"Interactive task for session {session_id} ended with an exception: {task.exception()}")
    

    # --- NEW METHOD FOR CLEANUP ON DISCONNECT ---
    async def cleanup_client_sessions(self, websocket: WebSocket):
        """Cancels all running interactive tasks owned by a disconnecting client."""
        sessions_to_cancel = [
            session_id for session_id, owner in self.session_owner.items() if owner == websocket
        ]
        if not sessions_to_cancel: return
        
        logger.warning(f"Client {websocket.client.host} disconnected. Cleaning up {len(sessions_to_cancel)} active session(s).")
        for session_id in sessions_to_cancel:
            task = self.active_interactive_tasks.get(session_id)
            if task and not task.done():
                task.cancel()
                logger.info(f"Cancelled running task for session '{session_id}'.")
            # The done_callback will handle the rest of the cleanup.

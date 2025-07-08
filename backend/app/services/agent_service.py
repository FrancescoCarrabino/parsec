import json
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

# ... (all your imports are correct) ...

from ..agents.registry import AgentRegistry
from ..agents.orchestrator_agent import OrchestratorAgent
from ..agents.web_content_fetcher import WebContentFetcher
from ..agents.content_crafter import ContentCrafter
from ..agents.canvas_agent import CanvasAgent
from ..agents.image_genius import ImageGenius
from ..agents.layout_maestro import LayoutMaestro
from ..agents.slide_designer import SlideDesigner
from .workspace_service import WorkspaceService

async def _do_nothing_sender(status: str, message: str, details: Dict = None):
    pass

class AgentService:
    def __init__(self, workspace_service: WorkspaceService):
        logger.info("Assembling Agentic System...")
        self.workspace_service = workspace_service
        self.agent_registry = AgentRegistry()
        list_of_agents_to_register = [
            WebContentFetcher(), ContentCrafter(),
            CanvasAgent(workspace_service=self.workspace_service),
            ImageGenius(),
            LayoutMaestro(workspace_service=self.workspace_service),
            SlideDesigner(workspace_service=self.workspace_service),
        ]
        for agent in list_of_agents_to_register:
            self.agent_registry.register_agent(agent)
        self.orchestrator = OrchestratorAgent(self.agent_registry)
        logger.success("Agentic System Assembled.")

    async def _invoke_agent_as_tool(self, agent_name: str, objective: str, context: Dict[str, Any], send_status_update: Callable) -> Any:
        logger.info(f"--- Sub-Task Invocation: Agent '{agent_name}' called with objective: '{objective}' ---")
        agent_to_invoke = self.agent_registry.get_agent(agent_name)
        if not agent_to_invoke:
            error_msg = f"Attempted to invoke non-existent agent: {agent_name}"
            logger.error(error_msg)
            return {"error": error_msg}
        return await agent_to_invoke.run_task(
            objective=objective,
            context=context,
            invoke_agent=self._invoke_agent_as_tool,
            send_status_update=send_status_update
        )

    # --- REPLACED with the robust try...finally version ---
    async def process_user_prompt(
        self,
        prompt_text: str,
        selected_ids: List[str],
        send_status_update: Callable = _do_nothing_sender
    ) -> List[Dict[str, Any]]:
        
        workflow_failed = False
        workflow_context = {
            "original_prompt": prompt_text, "selected_ids": selected_ids,
            "history": [], "commands": [],
        }

        try:
            await send_status_update("STARTED", "Workflow started...")
            
            # Pass the sender to the orchestrator
            plan = await self.orchestrator.create_plan(
                prompt_text, selected_ids, send_status_update=send_status_update
            )
            
            if not plan.tasks:
                logger.warning("Orchestrator did not create any tasks. Ending workflow.")
                # We can consider this a "failed" state for clarity
                workflow_failed = True
                await send_status_update("FAILED", "I couldn't create a plan for that request.")
                return []
            
            await send_status_update("PLAN_CREATED", f"Plan ready with {len(plan.tasks)} step(s). Let's go!")
            
            for i, task in enumerate(plan.tasks):
                agent_name, objective = task.get("agent_name"), task.get("objective")
                status_message = f"Step {i+1}/{len(plan.tasks)}: Asking the {agent_name} to work..."
                await send_status_update("EXECUTING_TASK", status_message, {"task_number": i+1, "total_tasks": len(plan.tasks), "agent_name": agent_name})
                
                specialist = self.agent_registry.get_agent(agent_name)
                if not specialist:
                    workflow_failed = True
                    await send_status_update("ERROR", f"Could not find a required specialist: {agent_name}")
                    break

                # The lambda here is crucial for passing the sender down during agent-to-agent calls
                task_result = await specialist.run_task(
                    objective=objective,
                    context=workflow_context,
                    invoke_agent=lambda an, obj, ctx: self._invoke_agent_as_tool(an, obj, ctx, send_status_update),
                    send_status_update=send_status_update
                )

                workflow_context["history"].append({"task": objective, "agent": agent_name, "result": task_result})

                if isinstance(task_result, dict) and task_result.get("status") == "failed":
                    error_msg = task_result.get('error', 'An agent reported a failure.')
                    logger.error(f"Task {i+1} failed: {error_msg}. Stopping workflow.")
                    await send_status_update("ERROR", f"Step {i+1} failed: {error_msg}")
                    workflow_failed = True
                    break

        except Exception as e:
            logger.exception("A critical error occurred during agent workflow.")
            await send_status_update("ERROR", f"A critical error occurred: {e}")
            workflow_failed = True
        
        finally:
            if not workflow_failed:
                # On success, send the final COMPLETED status
                await send_status_update("COMPLETED", "All done! Applying changes.")
                logger.info(f"Workflow finished successfully. Collected {len(workflow_context['commands'])} commands.")
                if workflow_context["commands"]:
                    self.workspace_service._commit_history()
            else:
                # On failure, send a clear FAILED status
                logger.warning("Workflow finished with errors. No changes will be committed.")
                # The specific error was already sent, this is just a final confirmation.
                await send_status_update("FAILED", "Workflow aborted due to an error.")

        return [] if workflow_failed else workflow_context.get("commands", [])
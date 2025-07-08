import json
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

# 1. Import all the components we need to assemble
from ..agents.registry import AgentRegistry
from ..agents.orchestrator_agent import OrchestratorAgent

# Import all concrete agent classes
from ..agents.web_content_fetcher import WebContentFetcher
from ..agents.content_crafter import ContentCrafter
from ..agents.canvas_agent import CanvasAgent
from ..agents.image_genius import ImageGenius
from ..agents.layout_maestro import LayoutMaestro
from ..agents.slide_designer import SlideDesigner

from .workspace_service import WorkspaceService

class AgentService:
    """
    The main engine that drives the agentic workflow.
    It is responsible for initializing the agent ecosystem and processing user requests
    in a dynamic, recursive manner.
    """

    def __init__(self, workspace_service: WorkspaceService):
        """
        This constructor assembles the agentic system.
        """
        logger.info("Assembling Agentic System...")
        self.workspace_service = workspace_service
        self.agent_registry = AgentRegistry()

        # --- REWRITTEN AGENT INITIALIZATION ---
        # Give agents access to the workspace service, but they will manage their own tool calls.
        list_of_agents_to_register = [
            WebContentFetcher(),
            ContentCrafter(), # ContentCrafter is now self-sufficient
            CanvasAgent(workspace_service=self.workspace_service),
            ImageGenius(),
            LayoutMaestro(workspace_service=self.workspace_service),
            SlideDesigner(workspace_service=self.workspace_service), # SlideDesigner is now a powerful, autonomous agent
        ]

        for agent in list_of_agents_to_register:
            self.agent_registry.register_agent(agent)

        self.orchestrator = OrchestratorAgent(self.agent_registry)
        logger.success("Agentic System Assembled.")

    async def _invoke_agent_as_tool(self, agent_name: str, objective: str, context: Dict[str, Any]) -> Any:
        """
        A private method that allows one agent to call another.
        This is the key to inter-agent communication.
        """
        logger.info(f"--- Sub-Task Invocation: Agent '{agent_name}' called with objective: '{objective}' ---")
        agent_to_invoke = self.agent_registry.get_agent(agent_name)
        if not agent_to_invoke:
            error_msg = f"Attempted to invoke non-existent agent: {agent_name}"
            logger.error(error_msg)
            return {"error": error_msg}

        # Recursively call the agent's run_task, passing the same context and invocation ability
        return await agent_to_invoke.run_task(
            objective=objective,
            context=context,
            invoke_agent=self._invoke_agent_as_tool # Pass the callback down
        )

    async def process_user_prompt(self, prompt_text: str, selected_ids: List[str]) -> List[Dict[str, Any]]:
        """
        The main entry point. It gets a high-level plan and executes it,
        allowing for dynamic, nested agent calls.
        """
        logger.info(f"--- New Workflow Initiated for Prompt: '{prompt_text}' ---")

        # The shared "scratchpad" for the entire workflow
        workflow_context: Dict[str, Any] = {
            "original_prompt": prompt_text,
            "selected_ids": selected_ids,
            "history": [], # A log of all actions and results for context
            "commands": [], # A list of commands to be sent to the frontend
        }

        # 1. Ask the Orchestrator to create the HIGH-LEVEL plan
        plan = await self.orchestrator.create_plan(prompt_text, selected_ids)

        if not plan.tasks:
            logger.warning("Orchestrator did not create any tasks. Ending workflow.")
            return []

        logger.info(f"Orchestrator high-level plan: {json.dumps([task.get('objective') for task in plan.tasks], indent=2)}")

        # 2. Execute the high-level plan, task by task
        for i, task in enumerate(plan.tasks):
            agent_name = task.get("agent_name")
            objective = task.get("objective")

            logger.info(f"--- Executing Top-Level Task {i+1}/{len(plan.tasks)}: [{agent_name}] -> '{objective}' ---")

            specialist = self.agent_registry.get_agent(agent_name)
            if not specialist:
                logger.error(f"Agent '{agent_name}' not found in registry. Skipping task.")
                workflow_context["history"].append({"task": objective, "agent": agent_name, "error": f"Agent '{agent_name}' not found."})
                continue

            try:
                # --- REWRITTEN EXECUTION ---
                # We now pass the entire context and the invoke_agent callback
                task_result = await specialist.run_task(
                    objective=objective,
                    context=workflow_context,
                    invoke_agent=self._invoke_agent_as_tool
                )

                # Agents are now responsible for appending their own commands to the context
                # and logging their results to the history.
                workflow_context["history"].append({
                    "task": objective,
                    "agent": agent_name,
                    "result": task_result
                })

                if isinstance(task_result, dict) and task_result.get("status") == "failed":
                     logger.error(f"Task {i+1} failed: {task_result.get('error')}. Stopping workflow.")
                     break

            except Exception as e:
                logger.exception(f"An unexpected error occurred executing task {i+1} by '{agent_name}'.")
                workflow_context["history"].append({ "task": objective, "agent": agent_name, "error": f"Unexpected exception: {str(e)}" })
                break

        logger.info(f"Workflow finished. Collected {len(workflow_context['commands'])} commands.")

        # --- FINAL HISTORY COMMIT ---
        # Only commit to workspace history if the workflow generated commands.
        if workflow_context["commands"]:
            logger.info("Committing final workspace state to history...")
            self.workspace_service._commit_history()
            logger.success("Workspace state committed.")
        else:
            logger.info("No commands were generated, skipping workspace commit.")

        return workflow_context["commands"]
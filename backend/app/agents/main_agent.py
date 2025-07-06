# parsec-backend/app/agents/main_agent.py
import json
import litellm
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent

# Pydantic models to structure the agent's plan (these are correct)
class SubTask(BaseModel):
    agent: str = Field(description="The name of the specialist agent to use (e.g., 'ContentStrategist', 'VisualDesigner', 'LayoutMaestro').")
    prompt: str = Field(description="The detailed, specific prompt to give to the specialist agent for this task.")
    loop_variable: Optional[str] = Field(None, description="If this task should be looped, the context variable to loop over.")
    output_variable: Optional[str] = Field(None, description="The context variable to store this task's output.")

class ExecutionPlan(BaseModel):
    thought: str = Field(description="Your reasoning and step-by-step thinking process for the plan.")
    plan: List[SubTask]

class MainAgent(BaseAgent):
    """
    The master orchestrator agent. It decomposes requests into a structured plan
    and then executes that plan by delegating to its specialist agents.
    """
    def __init__(self, **kwargs):
        super().__init__(agent_name="MainAgent", **kwargs)

    def _substitute_placeholders(self, template: str, context: Dict[str, Any]) -> str:
        # This helper function is correct and does not need changes.
        placeholders = re.findall(r"\{\{([\w\s.-]+)\}\}", template)
        for placeholder in placeholders:
            keys = placeholder.strip().split('.')
            value = context
            try:
                for key in keys:
                    if isinstance(value, list) and key.isdigit(): value = value[int(key)]
                    else: value = value[key]
                template = template.replace(f"{{{{{placeholder}}}}}", json.dumps(value) if isinstance(value, (dict, list)) else str(value))
            except Exception: logger.warning(f"Could not resolve placeholder '{{{placeholder}}}' in context.")
        return template

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        logger.info(f"MainAgent orchestrator received task: '{prompt}'")
        
        # --- STAGE 1: PLANNING ---
        # Get the list of available specialists from the pouch to inform the planner.
        available_specialists = list(self.agent_pouch.keys())
        
        system_prompt = (
            "You are a world-class project manager AI. Your job is to take a high-level user request and decompose it into a structured, step-by-step JSON execution plan. "
            f"You have a team of specialists: {available_specialists}. "
            "You must generate a logical plan of sub-tasks, assigning each to the correct specialist. The output of one step can be used in a later step. "
            "Your FINAL output MUST be a single, valid JSON object conforming to the ExecutionPlan schema."
        )
        
        user_example_prompt = "Create a 3-slide presentation about the benefits of hydration."
        assistant_example_response = { "thought": "First, I'll get the content from the ContentStrategist. Then, I'll loop over the content and have the VisualDesigner create a slide for each item. Finally, I'll ask the LayoutMaestro to arrange the created slides.", "plan": [
                { "agent": "ContentStrategist", "prompt": "Generate JSON for 3 slides on 'the benefits of hydration', with 'title' and 'content' keys.", "output_variable": "SLIDE_DATA"},
                { "agent": "VisualDesigner", "loop_variable": "SLIDE_DATA", "prompt": "Create a 1920x1080 frame named '{{item.title}}' and place the title and content '{{item.content}}' inside it.", "output_variable": "ALL_SLIDE_COMMANDS" },
                { "agent": "LayoutMaestro", "prompt": "Arrange all the newly created frames horizontally with 100px spacing."}
            ]}
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_example_prompt},
            {"role": "assistant", "content": json.dumps(assistant_example_response)},
            {"role": "user", "content": prompt}
        ]
        
        try:
            response = await litellm.acompletion(model=settings.LITELLM_TEXT_MODEL, messages=messages)
            plan_data = json.loads(response.choices[0].message.content)
            execution_plan = ExecutionPlan(**plan_data)
            logger.info(f"Generated execution plan: {execution_plan.thought}")
        except Exception as e:
            logger.exception(f"Failed to generate a valid execution plan: {e}")
            return []

        # --- STAGE 2: EXECUTION ---
        execution_context = context if context is not None else {}
        all_commands = []
        
        for i, task in enumerate(execution_plan.plan):
            logger.info(f"Executing step {i+1}/{len(execution_plan.plan)}: Agent '{task.agent}'")
            
            specialist = self.agent_pouch.get(task.agent)
            if not specialist:
                logger.error(f"Could not find specialist agent '{task.agent}' in pouch.")
                continue

            if task.loop_variable:
                items_to_loop = execution_context.get(task.loop_variable)
                if not isinstance(items_to_loop, list):
                    logger.error(f"Loop variable '{task.loop_variable}' not a list in context. Context is: {execution_context}")
                    continue
                
                # --- THIS IS A FIX: We need to capture the results of the loop ---
                all_loop_commands = []
                
                for item_index, item in enumerate(items_to_loop):
                    loop_context = {**execution_context, "item": item, "index": item_index}
                    task_prompt = self._substitute_placeholders(task.prompt, loop_context)
                    logger.info(f"  -> Loop {item_index+1}: {task_prompt}")
                    # The specialist returns a list of command dicts
                    commands = await specialist.handle_task(task_prompt, loop_context)
                    all_loop_commands.extend(commands)

                # After the loop, store the aggregated results if needed
                if task.output_variable:
                    execution_context[task.output_variable] = all_loop_commands
                    logger.info(f"Stored all loop results in context variable: '{task.output_variable}'")
                
                all_commands.extend(all_loop_commands)

            else: # This is a single execution task
                task_prompt = self._substitute_placeholders(task.prompt, execution_context)
                logger.info(f"  -> Prompt: {task_prompt}")
                result = await specialist.handle_task(task_prompt, execution_context)
                
                # --- THIS IS THE FIX: Correctly handle and store the results ---
                if task.output_variable:
                    # If the ContentStrategist returns {'slides': [...]}, extract the list.
                    if task.agent == "ContentStrategist" and isinstance(result, dict):
                        # Find the first value in the dict that is a list.
                        list_value = next((v for v in result.values() if isinstance(v, list)), None)
                        execution_context[task.output_variable] = list_value or []
                    else:
                        execution_context[task.output_variable] = result
                    
                    logger.info(f"Stored result in context variable: '{task.output_variable}'")

                # If the result is a list of commands, aggregate them.
                if isinstance(result, list):
                    all_commands.extend(result)
        
        # --- NEW FINAL STEP: Post-processing for LayoutMaestro ---
        # After the plan is done, if the LayoutMaestro was supposed to be called,
        # we need to give it the context of the elements that were just created.
        final_layout_task = next((task for task in execution_plan.plan if task.agent == 'LayoutMaestro'), None)
        if final_layout_task:
            logger.info("Executing final layout task...")
            # Extract all newly created element IDs from the commands we generated.
            newly_created_frame_ids = []
            for command in all_commands:
                if command.get("type") == "ELEMENT_CREATED" and command["payload"]["element_type"] == "frame":
                    newly_created_frame_ids.append(command["payload"]["id"])
            
            # If we have new frames, call LayoutMaestro with them as the selection context.
            if newly_created_frame_ids:
                layout_context = {"selected_ids": newly_created_frame_ids}
                layout_prompt = self._substitute_placeholders(final_layout_task.prompt, layout_context)
                
                layout_maestro = self.agent_pouch.get('LayoutMaestro')
                if layout_maestro:
                    layout_commands = await layout_maestro.handle_task(layout_prompt, layout_context)
                    all_commands.extend(layout_commands)

        logger.success(f"Execution plan completed. Total commands: {len(all_commands)}")
        return all_commands

    async def process_prompt(self, prompt_text: str, selected_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Legacy entry point, wraps handle_task."""
        return await self.handle_task(prompt_text, {"selected_ids": selected_ids})
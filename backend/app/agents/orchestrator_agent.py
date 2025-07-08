import json
import litellm
from loguru import logger
from typing import List, Dict, Any, Callable
from pydantic import BaseModel, Field
from ..core.config import settings
from .registry import AgentRegistry

# A do-nothing fallback function to make the send_status_update parameter optional and safe.
async def _do_nothing_sender(status: str, message: str, details: Dict = None):
    pass


# --- Plan Model Definition ---
class Plan(BaseModel):
    """A Pydantic model for a structured plan of action, consisting of tasks."""
    tasks: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="A list of tasks, where each task specifies an agent and its objective."
    )

class OrchestratorAgent:
    """
    The OrchestratorAgent is responsible for understanding a user's request and breaking it down
    into a sequence of actionable tasks, assigning each task to the most appropriate specialist agent.
    It leverages a registry of agent capabilities and uses few-shot examples to guide its planning process.
    """
    def __init__(self, agent_registry: AgentRegistry):
        self.agent_registry = agent_registry
        logger.info("OrchestratorAgent initialized.")

    async def create_plan(self, prompt: str, selected_ids: List[str] = None, send_status_update: Callable = _do_nothing_sender) -> Plan:
        """
        Generates a plan (list of tasks) based on the user's prompt and current context.
        """
        logger.info(f"Orchestrator creating a plan for prompt: '{prompt}', with selected IDs: {selected_ids}")

        # --- Prepare Agent Capabilities Summary ---
        available_agents = self.agent_registry.get_all_agents()
        capabilities_docs = []
        for agent in available_agents:
            # Ensure description is a dictionary before accessing keys
            desc = agent.description if isinstance(agent.description, dict) else {}
            doc = (
                f"Agent Name: {agent.name}\n"
                f"  Purpose: {desc.get('purpose', 'N/A')}\n"
                f"  Input Expectation: {desc.get('input', 'N/A')}\n"
                f"  Output Format: {desc.get('output', 'N/A')}\n"
                f"  Limitations: {desc.get('limitations', 'N/A')}"
            )
            capabilities_docs.append(doc)
        capabilities_summary = "\n---\n".join(capabilities_docs)

        # --- Prepare Selection Context ---
        selection_context_str = ""
        if selected_ids:
            selection_context_str = f"**User Selection Context:** The user has selected elements with the following IDs: {json.dumps(selected_ids)}\nThis context is critical for tasks involving existing elements (e.g., layout, modification)."
        else:
            selection_context_str = "**User Selection Context:** No elements are currently selected by the user."

        # --- Refined Few-Shot Examples ---
        few_shot_examples = """
        **EXAMPLE 1: Creating a Standalone Element**
        User Request: "Create an image of a dog."
        User Selection Context: No elements selected.
        JSON Plan:
        {
        "tasks": [
            {
            "agent_name": "CanvasAgent",
            "objective": "Create and place an image of a dog onto the canvas.",
            "reasoning": "The user asked for a single image, not a slide or presentation. The CanvasAgent is the specialist for creating individual elements directly on the main canvas. It can invoke the ImageGenius to get the image URL and then handle the placement itself."
            }
        ]
        }

        **EXAMPLE 2: Creating an Element within a Slide (Situational)**
        User Request: "Create a new slide with an image of a cat."
        User Selection Context: No elements selected.
        JSON Plan:
        {
        "tasks": [
            {
            "agent_name": "SlideDesigner",
            "objective": "Design and create a new slide that features an image of a cat.",
            "reasoning": "The user explicitly mentioned the word 'slide'. Therefore, the SlideDesigner is the correct project manager for this task. It will handle creating the slide frame and invoking the ImageGenius for the content."
            }
        ]
        }

        **EXAMPLE 3: Full Presentation Creation**
        User Request: "Make a 2-slide presentation about space exploration."
        User Selection Context: No elements selected.
        JSON Plan:
        {
        "tasks": [
            {
            "agent_name": "SlideDesigner",
            "objective": "Design and create a title slide for a presentation on 'Space Exploration'.",
            "reasoning": "The user wants a presentation. The first step is a title slide. The SlideDesigner is the expert for this."
            },
            {
            "agent_name": "SlideDesigner",
            "objective": "Design and create a content slide discussing key milestones in space exploration.",
            "reasoning": "This is the second slide. The objective is a high-level design brief for the SlideDesigner, which will handle its own content generation and layout."
            }
        ]
        }

        **EXAMPLE 4: Modifying an Existing Element**
        User Request: "Make this text blue."
        User Selection Context: Selected elements: ["text_123"]
        JSON Plan:
        {
        "tasks": [
            {
            "agent_name": "CanvasAgent",
            "objective": "Change the fill color of the element with ID 'text_123' to blue.",
            "reasoning": "The user wants to modify a property of a specific, selected element. The CanvasAgent is the specialist for direct element manipulation."
            }
        ]
        }
        """

        # --- REWRITTEN SYSTEM PROMPT ---
        system_prompt = f"""
        You are an AI Master Planner (a CEO). Your goal is to analyze a user's request and delegate it to the most appropriate specialist agent by creating a high-level strategic plan.

        **CRITICAL INSTRUCTIONS:**
        1.  **Analyze Intent:** Carefully read the user's request. Pay close attention to keywords.
            *   If the user mentions **"slide"**, **"presentation"**, or **"deck"**, the task should be assigned to the `SlideDesigner`.
            *   If the user asks to create a single item (e.g., "an image", "a text box") without mentioning a slide, the task should be assigned to the `CanvasAgent`.
            *   If the user asks to modify an existing element (e.g., "make this bigger", "change the color"), the task should be assigned to the `CanvasAgent`.
        2.  **Delegate, Don't Micromanage:** Formulate a high-level `objective` that tells the chosen agent WHAT to do, not HOW to do it. Trust your specialists.
        3.  **Output Format:** ALWAYS output a JSON object with a single "tasks" key.

        **AVAILABLE AGENTS:**
        ---
        {capabilities_summary}
        ---

        {selection_context_str}

        **PLANNING EXAMPLES (Study these carefully to understand WHEN to use each agent):**
        ---
        {few_shot_examples}
        ---

        **User Request:** "{prompt}"
        **Your Task:** Generate the JSON plan.
        """

        messages = [{"role": "system", "content": system_prompt}]

        try:
            await send_status_update("PLANNING", "Formulating a high-level plan...")
            logger.debug(f"Sending prompt to LLM:\n{system_prompt}") # Log the full prompt for debugging
            
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL,
                messages=messages,
                # Request JSON output directly from the model
                response_format={"type": "json_object"},
                temperature=0.1, # Low temperature for deterministic planning
                api_key=settings.AZURE_API_KEY_TEXT,
                api_base=settings.AZURE_API_BASE_TEXT,
                api_version=settings.AZURE_API_VERSION_TEXT,
            )

            plan_json_str = response.choices[0].message.content
            logger.debug(f"LLM Raw Response: {plan_json_str}") # Log the raw LLM output

            if not plan_json_str:
                raise ValueError("LLM returned an empty response.")

            plan_data = json.loads(plan_json_str)

            # Validate the structure using Pydantic Plan model
            plan = Plan(**plan_data)
            
            # --- Data Validation & Refinement ---
            validated_tasks = []
            for i, task in enumerate(plan.tasks):
                if not task.get("agent_name"):
                    logger.warning(f"Task {i+1} in plan is missing 'agent_name'. Skipping task.")
                    continue
                if not task.get("objective"):
                    logger.warning(f"Task {i+1} ('{task.get('agent_name')}') is missing 'objective'. Skipping task.")
                    continue
                if not task.get("reasoning"):
                    logger.warning(f"Task {i+1} ('{task.get('agent_name')}') is missing 'reasoning'. Adding placeholder.")
                    task["reasoning"] = "LLM did not provide reasoning." # Add placeholder
                
                # Basic check: Does the agent exist?
                if not self.agent_registry.get_agent(task["agent_name"]):
                    logger.warning(f"Task {i+1} specified unknown agent '{task['agent_name']}'. This task might fail later. Attempting to proceed.")
                    # Potentially offer alternatives or flag this task for manual intervention if possible.
                    # For now, we'll let it pass through and fail during execution.

                validated_tasks.append(task)
            
            plan.tasks = validated_tasks # Update plan with validated tasks
            
            if not plan.tasks:
                 logger.warning("Orchestrator generated a plan, but after validation, no valid tasks remain.")
                 return Plan() # Return empty plan if all tasks were invalid

            logger.success(f"Orchestrator successfully created a plan with {len(plan.tasks)} task(s).")
            return plan

        except json.JSONDecodeError as e:
            logger.error(f"LLM response was not valid JSON: {e}. Response: {plan_json_str}")
            await send_status_update("ERROR", str(e))
            return Plan() # Return empty plan on JSON error
        except ValueError as e:
            logger.error(f"LLM response failed Pydantic validation: {e}. Response: {plan_json_str}")
            await send_status_update("ERROR", str(e))
            return Plan() # Return empty plan on validation error
        except Exception as e:
            logger.exception(f"Orchestrator failed during plan creation: {e}")
            await send_status_update("ERROR", str(e))
            return Plan() # Return empty plan on any other exception
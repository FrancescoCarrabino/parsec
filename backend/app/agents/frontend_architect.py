# parsec-backend/app/agents/frontend_architect.py

import json
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine, Union
import pydantic
import uuid
import asyncio

from ..core.config import settings
from .models import Agent
from ..models import elements as element_models
from ..services.workspace_service import WorkspaceService

ChildElementsAdapter = pydantic.TypeAdapter(
    List[Union[element_models.ShapeElement, element_models.TextElement]]
)


class ScaffoldingPlan(pydantic.BaseModel):
    containers: List[element_models.ShapeElement]


class InteriorDesignResult(pydantic.BaseModel):
    elements: List[Union[element_models.ShapeElement, element_models.TextElement]]


class FrontendArchitect(Agent):
    """
    A master designer that uses a robust, two-step "Scaffolding" process.
    First, an Architect creates the main container shapes. Then, Specialists
    fill each container with detailed, composed child elements.
    """

    def __init__(self, workspace_service: WorkspaceService):
        self._workspace = workspace_service
        self._execution_methods = {
            "create_frame": self._create_frame,
            "create_shape": self._create_shape,
            "create_text": self._create_text,
        }

    @property
    def name(self) -> str:
        return "FrontendArchitect"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Designs and builds a complete, professional UI layout using a robust two-step process to ensure detail and quality.",
            "input": "A high-level natural language description of a UI screen, which can include theme hints like 'dark mode'.",
            "output": "A fully composed set of shapes and text elements on the canvas.",
        }

    @property
    def tools(self) -> List[Any]:
        return []

    @property
    def available_functions(self) -> Dict[str, Callable]:
        return {}

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable,
        send_status_update: Callable,
    ) -> Dict[str, Any]:
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")
        try:
            await send_status_update("AGENT_STATUS_UPDATE", "Preparing the design canvas...", {"status": "PREPARING"})
            frame_id = f"canvas_{uuid.uuid4().hex[:8]}"
            main_canvas_frame = {
                "id": frame_id,
                "element_type": "frame",
                "x": 0,
                "y": 0,
                "width": 1920,
                "height": 1080,
                "name": "Main Canvas",
                "fill": {"type": "solid", "color": "#F0F2F5"},
                "strokeWidth": 0,
            }

            await send_status_update(
                "AGENT_STATUS_UPDATE",
                "Step 1/2: Architecting main container panels...",
                {"status": "THINKING"}
            )
            theme = await self._decide_on_theme(objective)
            main_canvas_frame["fill"]["color"] = theme.get("backgroundColor", "#F0F2F5")

            container_shapes = await self._create_scaffolding(
                objective, theme, frame_id
            )
            if not container_shapes:
                raise ValueError("Architect step failed to produce container shapes.")

            await send_status_update(
                "AGENT_STATUS_UPDATE",
                "Step 2/2: Designing content for each container...",
                {"status": "THINKING"}
            )

            specialist_tasks = []
            for i, container in enumerate(container_shapes):
                await send_status_update(
                    "AGENT_STATUS_UPDATE",
                    f"Step 2.{i+1}/{len(container_shapes)}: Designing inside the '{container['name']}'...",
                    {"status": "THINKING"}
                )
                specialist_tasks.append(
                    self._run_interior_designer(container, theme, frame_id)
                )

            child_element_groups = await asyncio.gather(*specialist_tasks)

            all_child_elements = []
            for i, container in enumerate(container_shapes):
                child_group = child_element_groups[i]

                # --- THIS IS THE FIX: FAIL-FAST ERROR HANDLING ---
                if child_group is None:  # The specialist returned None on failure
                    raise ValueError(
                        f"The Interior Designer specialist failed to create content for the '{container['name']}' container."
                    )

                for child in child_group:
                    child["x"] += container["x"]
                    child["y"] += container["y"]
                    all_child_elements.append(child)

            if not all_child_elements:
                raise ValueError(
                    "The Interior Designer step produced no child elements overall."
                )

            await send_status_update("AGENT_STATUS_UPDATE", "Assembling final build plan...", {"status": "PLANNING"})
            final_elements_list = (
                [main_canvas_frame] + container_shapes + all_child_elements
            )
            logger.info(f"BUILD PLAN: {final_elements_list}")
            build_plan = self._translate_elements_to_build_plan(final_elements_list)

            await send_status_update(
                "AGENT_STATUS_UPDATE",
                f"Final plan ready with {len(build_plan)} steps. Building UI...",
                {"status": "PLAN_CREATED"}
            )
            for i, task in enumerate(build_plan):
                tool_name, params = task.get("tool_name"), task.get("params", {})
                status_msg = f"Step {i+1}/{len(build_plan)}: Building the {params.get('name', task.get('id'))}..."
                await send_status_update(
                    "AGENT_STATUS_UPDATE",
                    status_msg,
                    {"status": "EXECUTING_TASK"}
                )
                builder_method = self._execution_methods.get(tool_name)
                if builder_method:
                    await builder_method(context=context, **params)

            return {"status": "success"}
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed catastrophically.")
            await send_status_update("ERROR", f"A critical error occurred: {e}")
            return {"status": "failed", "error": str(e)}

    async def _create_scaffolding(
        self, objective: str, theme: Dict[str, str], frame_id: str
    ) -> List[Dict]:
        system_prompt = f"""
        You are a precise JSON data entry assistant. Your only job is to create a list of JSON objects for layout containers, following a strict template.

        **TASK:**
        1.  Based on the user's objective, identify 5-10 common main UI components. (Always include at least the header, sidebar, user icon and footer)
        2.  For each component, create a `ShapeElement` object by filling in the template below.
        3.  Determine the `name`, `x`, `y`, `width`, and `height` for each container. Remember that are you filling a canvas of 1920x1080 pixels, so use all the space you have follow common frontend building patterns.
        4.  Your final output MUST be a single JSON object with a key "containers" which holds a list of the shape objects you created.

        **TEMPLATE (Use this exact structure for every shape):**
        ```json
        {{
          "name": "Component Name Container",
          "element_type": "shape",
          "shape_type": "rect",
          "x": 0.0,
          "y": 0.0,
          "width": 0.0,
          "height": 0.0,
          "fill": {{ "type": "solid", "color": "{theme['panelColor']}" }},
          "stroke": {{ "type": "solid", "color": "{theme['subtleBorderColor']}" }},
          "strokeWidth": 1,
          "cornerRadius": 12,
          "parentId": "{frame_id}"
        }}
        ```
        Remember that the "parentId" variable is always {frame_id}
        Do not use keys like "position", "size", or "label". Adhere strictly to the template.
        CHAIN OF THOUGHT: think through this solution step by step. Give out the final json parsable blob only when you are ready. 
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": objective},
        ]
        response = await litellm.acompletion(
            model=settings.LITELLM_TEXT_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            timeout=90,
            api_key=settings.AZURE_API_KEY_TEXT,
            api_base=settings.AZURE_API_BASE_TEXT,
            api_version=settings.AZURE_API_VERSION_TEXT,
        )
        try:
            plan = ScaffoldingPlan.model_validate_json(
                response.choices[0].message.content
            )
            return [item.model_dump() for item in plan.containers]
        except Exception as e:
            logger.error(
                f"Scaffolding Architect step failed validation: {e}\nRaw: {response.choices[0].message.content}"
            )
            return []

    async def _run_interior_designer(
        self, container: Dict[str, Any], theme: Dict[str, str], frame_id: str
    ) -> List[Dict] | None:
        """[Specialist Step] Fills a single container with detailed child elements. Returns None on failure."""

        # --- THIS IS THE FINAL, UNBREAKABLE SPECIALIST PROMPT ---
        system_prompt = f"""
        You are a precise JSON data entry assistant. Your only job is to fill in the templates below to create a set of child elements for a UI container.
        You have to think like a Frontend Designer. You are building elements for a frontend design that is going to be used by a real-life application.
        Think of ShapeElements as your <div>, <table>, or whatever other main html element you can think of. Instead of providing html, though, you are producing
        a set of basic shapes that should mimic that behaviour. The same goes for TextElements, they are your <h1>, <h2>, etc. text elements you would typically 
        insert in a frontend. Your only constraint is the assigned container, which is a very specific div for certain content. Analyze the structure, the dimension
        and the placement.

        **YOUR ASSIGNED CONTAINER:**
        ```json
        {json.dumps(container, indent=2)}
        ```

        **YOUR THEME PALETTE:**
        ```json
        {json.dumps(theme, indent=2)}
        ```

        **YOUR TASK:**
        1.  Look at the `name` of the container to understand its purpose.
        2.  Create a list of 2-3 child elements to go inside it by filling in the templates below.
        3.  **Positioning:** All `x`, `y` coordinates MUST be relative to the container's top-left corner (0,0). A 24px padding means `x: 24, y: 24`.
        4.  **Content:** Provide rich, realistic example content, not just "[placeholder]".
        5. Think also about style and color. Use hex codes that go well together. Respect the {theme}

        **TEMPLATES (Copy these structures exactly):**

        *Shape Template:*
        ```json
        {{
            "name": "Descriptive Name",
            "element_type": "shape",
            "shape_type": "rect",
            "parentId": "{container['id']}",
            "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0,
            "fill": {{ "type": "solid", "color": "<an hex code of your choice>"}},
            "strokeWidth": 0, "cornerRadius": 8,
            "parentId": "{frame_id}"
        }}
        ```

        *Text Template:*
        ```json
        {{
            "name": "Descriptive Name",
            "element_type": "text",
            "parentId": "{container['id']}",
            "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0,
            "content": "Example Content",
            "fontColor": "<an hex code of your choice>",
            "fontSize": 14,
            "fontWeight": 400,
            "parentId": "{frame_id}"
        }}
        ```
        IMPORTANT: Remember that the parentId is always {frame_id}

        CHAIN OF THOUGHT: think through this solution step by step. Give out the final json parsable blob only when you are ready. 


        **FINAL OUTPUT FORMAT:**
        Your output must be a single JSON object with ONE key, "elements", which contains a list of the filled-in element objects.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Create the child elements for the '{container['name']}' container.",
            },
        ]
        response = await litellm.acompletion(
            model=settings.LITELLM_TEXT_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            timeout=90,
            api_key=settings.AZURE_API_KEY_TEXT,
            api_base=settings.AZURE_API_BASE_TEXT,
            api_version=settings.AZURE_API_VERSION_TEXT,
        )
        try:
            result = InteriorDesignResult.model_validate_json(
                response.choices[0].message.content
            )
            return [item.model_dump() for item in result.elements]
        except Exception as e:
            logger.error(
                f"Interior Designer for '{container['name']}' failed validation: {e}\nRaw: {response.choices[0].message.content}"
            )
            return None  # Return None on failure

    async def _decide_on_theme(self, objective: str) -> Dict[str, str]:
        system_prompt = "You are a UI Theme Generator. Based on the user's objective, decide on a color palette. Your output must be a single JSON object with keys for `backgroundColor`, `panelColor`, `primaryTextColor`, `secondaryTextColor`, and `subtleBorderColor`. If the objective mentions 'dark mode', create a dark theme. Otherwise, create a professional light theme."
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": objective},
        ]
        response = await litellm.acompletion(
            model=settings.LITELLM_TEXT_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            api_key=settings.AZURE_API_KEY_TEXT,
            api_base=settings.AZURE_API_BASE_TEXT,
            api_version=settings.AZURE_API_VERSION_TEXT,
        )
        try:
            return pydantic.TypeAdapter(Dict[str, str]).validate_json(
                response.choices[0].message.content
            )
        except Exception:
            return {
                "backgroundColor": "#F0F2F5",
                "panelColor": "#FFFFFF",
                "primaryTextColor": "#1A202C",
                "secondaryTextColor": "#4A5568",
                "subtleBorderColor": "#E2E8F0",
            }

    def _translate_elements_to_build_plan(self, elements: List[Dict]) -> List[Dict]:
        build_plan = []
        for element_data in elements:
            params = element_data.copy()
            element_type = params.pop("element_type", "frame").lower()
            tool_name = f"create_{element_type}"
            build_plan.append({"tool_name": tool_name, "params": params})
        return build_plan

    # --- DIRECT BUILDER METHODS ---
    async def _create_frame(self, context: dict, **params) -> None:
        payload = {**params, "element_type": "frame"}
        element = self._workspace.create_element_from_payload(payload)
        if element:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
            )

    async def _create_shape(self, context: dict, **params) -> None:
        payload = {**params, "element_type": "shape"}
        element = self._workspace.create_element_from_payload(payload)
        if element:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
            )

    async def _create_text(self, context: dict, **params) -> None:
        payload = {**params, "element_type": "text"}
        element = self._workspace.create_element_from_payload(payload)
        if element:
            context["commands"].append(
                {"type": "ELEMENT_CREATED", "payload": element.model_dump()}
            )

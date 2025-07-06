# parsec-backend/app/agents/design_genius.py
import json
import litellm
import asyncio
from typing import List, Dict, Callable, Any, Optional

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CREATE_ELEMENTS_TOOL

class DesignGenius(BaseAgent):
    """
    A master agent for visual design. It can autonomously delegate content generation
    to a specialist before executing the visual layout.
    """
    def __init__(self, **kwargs):
        super().__init__(agent_name="DesignGenius", **kwargs)
        # We now add an internal delegation tool
        self.tools = [CREATE_ELEMENTS_TOOL, self._get_delegation_tool()]
        self.available_functions: Dict[str, Callable] = {
            "create_elements": self.common_tools.create_elements,
            "delegate_to_content_strategist": self._delegate_for_content,
        }

    def _get_delegation_tool(self):
        return {
            "type": "function", "function": {
                "name": "delegate_to_content_strategist",
                "description": "Use this tool ONLY when the user's request requires specific knowledge or content (e.g., 'a presentation about AI', 'an article on climate change'). Delegate the topic to the ContentStrategist to get structured data FIRST.",
                "parameters": {"type": "object", "properties": {
                        "topic": {"type": "string", "description": "The core topic or subject matter to be researched by the ContentStrategist."}
                    }, "required": ["topic"]},
            }
        }

    async def _delegate_for_content(self, topic: str) -> str:
        """Internal tool implementation that calls the ContentStrategist peer."""
        logger.info(f"DesignGenius is delegating content generation for topic: '{topic}'")
        content_strategist = self.agent_pouch.get("ContentStrategist")
        if not content_strategist:
            return "Error: ContentStrategist not available."
        
        # Create a clear, structured prompt for the specialist
        content_prompt = f"Generate a structured JSON array of items for the topic: '{topic}'. Each item must have 'title' and 'content' keys."
        structured_data = await content_strategist.handle_task(content_prompt)
        
        if not structured_data:
            return "Error: Failed to get data from ContentStrategist."
            
        return json.dumps(structured_data)

    async def _execute_single_tool_call(self, system_prompt: str, user_prompt: str) -> tuple[list[dict[str, Any]], list[str]]:
        """A private helper to perform one focused tool call and return the command and affected IDs."""
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        response = await litellm.acompletion(model=settings.LITELLM_TEXT_MODEL, messages=messages, tools=self.tools)
        response_message = response.choices[0].message
        
        if not response_message.tool_calls:
            logger.warning(f"Agent '{self.agent_name}' failed to produce a tool call for prompt: {user_prompt}")
            return [], []

        tool_call = response_message.tool_calls[0]
        function_name = tool_call.function.name
        function_to_call = self.available_functions.get(function_name)
        if not function_to_call: return [], []

        function_args = json.loads(tool_call.function.arguments)
        command, affected_ids = function_to_call(**function_args)
        return [command] if command else [], affected_ids

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """The main orchestrator method for designing content."""
        logger.info(f"DesignGenius orchestrator received task: '{prompt}'")

        # Step 1: Delegate to ContentStrategist to get structured data
        content_strategist = self.agent_pouch.get("ContentStrategist")
        if not content_strategist:
            logger.error("ContentStrategist not found in agent pouch!")
            return []
        
        content_prompt = f"Generate a structured JSON array for a user's request: '{prompt}'. Each item must have 'title' and 'content' keys."
        structured_data = await content_strategist.handle_task(content_prompt)

        if not structured_data or not isinstance(structured_data, list):
            logger.error(f"Failed to get valid data from ContentStrategist. Data: {structured_data}")
            return []

        all_commands = []
        frame_system_prompt = "You are a designer that creates frame elements. Your only job is to call `create_elements` to make a single frame based on the user's request."
        content_system_prompt = "You are a designer that places text content inside a parent frame. You MUST use the `parentId` property in your `create_elements` tool call."

        # Step 2: Use a reliable Python loop to orchestrate the creation of each slide
        for i, item_data in enumerate(structured_data):
            title = item_data.get('title', 'Untitled')
            content = item_data.get('content', 'No content.')
            logger.info(f"Orchestrating creation for slide {i+1}: '{title}'")

            # Step 2a: Create the frame for this slide
            frame_prompt = f"Create a single presentation slide frame for a slide titled '{title}'. Position it at x={100 + (i * 1480)}, y=100. Use a standard slide size of 1280x720."
            frame_commands, frame_ids = await self._execute_single_tool_call(frame_system_prompt, frame_prompt)
            if not frame_commands or not frame_ids:
                logger.error(f"Failed to create frame for slide {i+1}. Skipping.")
                continue
            
            all_commands.extend(frame_commands)
            frame_id = frame_ids[0]

            # Step 2b: Create the content for this slide, inside the new frame
            content_prompt = (
                f"Create a title text element and a content text element. The title is '{title}' and the content is '{content}'. "
                f"You MUST place them inside the frame with parentId '{frame_id}'. Position them logically within that frame (e.g., title at top-left, content below)."
            )
            content_commands, _ = await self._execute_single_tool_call(content_system_prompt, content_prompt)
            all_commands.extend(content_commands)

        logger.success(f"DesignGenius orchestration complete. Generated {len(all_commands)} total commands.")
        return all_commands
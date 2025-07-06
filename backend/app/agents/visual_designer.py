# parsec-backend/app/agents/visual_designer.py
import json
import litellm
from typing import List, Dict, Callable, Any, Optional

from loguru import logger
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CREATE_FRAME_TOOL, CREATE_TEXT_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL, GROUP_ELEMENTS_TOOL

class VisualDesigner(BaseAgent):
    """A specialist agent for EXECUTING concrete visual design tasks."""
    def __init__(self, **kwargs):
        super().__init__(agent_name="VisualDesigner", **kwargs)
        self.tools = [CREATE_FRAME_TOOL, CREATE_TEXT_ELEMENTS_TOOL, UPDATE_ELEMENTS_TOOL, GROUP_ELEMENTS_TOOL]
        self.available_functions: Dict[str, Callable] = {
            "create_frame": self.common_tools.create_frame,
            "create_text_elements": self.common_tools.create_text_elements,
            "update_elements": self.common_tools.update_elements,
            "group_elements": self.common_tools.group_elements,
        }

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Executes a single, well-defined visual design task by calling tools."""
        logger.info(f"VisualDesigner received execution task: '{prompt}'")
        system_prompt = "You are a precise visual execution agent. Your only job is to translate the user's concrete instruction into a sequence of tool calls. Follow the instructions exactly."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}]
        
        all_commands = []
        try:
            for _ in range(5): # Allow for multi-step execution within a single task
                response = await litellm.acompletion(model=settings.LITELLM_TEXT_MODEL, messages=messages, tools=self.tools)
                response_message = response.choices[0].message
                if not response_message.tool_calls: break
                messages.append(response_message)
                
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    args = json.loads(tool_call.function.arguments)
                    command, affected_ids = self.available_functions[function_name](**args)
                    if command: all_commands.append(command)
                    messages.append({"tool_call_id": tool_call.id, "role": "tool", "name": function_name, "content": json.dumps({"status": "success", "created_ids": affected_ids})})
            return all_commands
        except Exception:
            logger.exception("An error occurred in the VisualDesigner's execution.")
            return []
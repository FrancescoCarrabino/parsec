import json
import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine, Optional
from pydantic import BaseModel, Field

from ..core.config import settings
from .models import Agent, Tool

# --- NEW: Define a Pydantic model for the agent's output ---
# This helps the LLM produce reliable, structured JSON.
class CraftedContent(BaseModel):
    title: Optional[str] = Field(None, description="A main title for a slide or document.")
    subtitle: Optional[str] = Field(None, description="A subtitle that complements the main title.")
    bullet_points: Optional[List[str]] = Field(None, description="A list of key points, suitable for a content slide.")
    body_text: Optional[str] = Field(None, description="A paragraph of detailed text.")
    image_search_query: Optional[str] = Field(None, description="A concise search query for a relevant image (e.g., 'futuristic AI robot').")

class ContentCrafter(Agent):
    """
    A specialist agent for generating written content. It takes a high-level topic
    and produces structured text (titles, bullets, etc.) in a JSON format.
    """
    @property
    def name(self) -> str: return "ContentCrafter"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "To generate structured written content (titles, subtitles, bullet points, body text) based on a given topic or objective.",
            "input": "A natural language objective, e.g., 'Write a title and three bullet points about the benefits of AI'.",
            "output": "A JSON object containing the requested text components.",
            "limitations": "Does not create images or canvas elements. It only produces text."
        }

    # This agent is simple and doesn't need internal tools, so these can be empty.
    @property
    def tools(self) -> List[Tool]: return []

    @property
    def available_functions(self) -> Dict[str, Callable]: return {}

    # --- THE CORRECTED METHOD SIGNATURE ---
    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]],
        send_status_update: Callable
    ) -> Dict[str, Any]:
        """
        This agent's task is simple: take an objective, ask the LLM to write content,
        and return it as structured JSON. It does not need to use the 'invoke_agent' callback itself,
        but it must accept it to be callable by other agents.
        """
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")

        system_prompt = f"""
        You are an expert content writer and strategist. Your task is to generate clear, concise, and engaging content based on the user's objective.

        **CRITICAL INSTRUCTIONS:**
        1.  Analyze the user's objective to understand the desired content.
        2.  Generate the content requested.
        3.  You MUST format your response as a single, valid JSON object that conforms to the provided schema. Do not add any text or explanation outside of the JSON object.

        **JSON Schema for your output:**
        {json.dumps(CraftedContent.model_json_schema(), indent=2)}
        """

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": objective}
        ]

        try:
            response = await litellm.acompletion(
                model=settings.LITELLM_TEXT_MODEL,
                messages=messages,
                response_format={"type": "json_object"}, # Instruct the model to return JSON
                temperature=0.5,
                api_key=settings.AZURE_API_KEY_TEXT,
                api_base=settings.AZURE_API_BASE_TEXT,
                api_version=settings.AZURE_API_VERSION_TEXT,
            )

            response_content = response.choices[0].message.content
            logger.debug(f"ContentCrafter LLM raw response: {response_content}")

            # Parse and validate the response using our Pydantic model
            content_data = CraftedContent.model_validate_json(response_content)

            # Return the content as a dictionary, which becomes the tool_result for the calling agent
            return content_data.model_dump(exclude_none=True)

        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {"error": f"Failed to craft content: {str(e)}"}
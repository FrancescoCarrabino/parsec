import litellm
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

from ..core.config import settings
from .models import Agent


class ImageGenius(Agent):
    """
    A specialist agent that generates an image from a textual description.
    It takes a clear objective and returns a URL to the generated image.
    """

    @property
    def name(self) -> str:
        return "ImageGenius"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Generates a high-quality image based on a descriptive text prompt.",
            "input": "A clear, descriptive prompt for the image (e.g., 'A photorealistic cat wearing a wizard hat').",
            "output": "A dictionary containing the generated image URL and the prompt used.",
            "limitations": "Does NOT place the image on the canvas. It only creates the image URL. Another agent must be used for placement.",
        }

    # This agent is simple and has one core function, so it doesn't need internal tools for its own LLM brain.
    @property
    def tools(self) -> List[Any]:
        return []

    @property
    def available_functions(self) -> Dict[str, Callable]:
        return {}

    # --- THE CORRECTED METHOD SIGNATURE ---
    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable[[str, str, Dict], Coroutine[Any, Any, Any]],
        send_status_update: Callable,
    ) -> Dict[str, Any]:
        """
        Takes a descriptive objective as a prompt, generates an image using the image model,
        and returns a dictionary with the image URL. It accepts the standard agent
        arguments but does not need to use 'invoke_agent'.
        """
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")

        # The objective *is* the prompt. The calling agent is responsible for providing a good one.
        image_prompt = objective

        if not image_prompt or len(image_prompt.strip()) < 5:
            error_msg = f"Cannot generate image: The provided objective/prompt is too short. Got: '{image_prompt}'"
            logger.error(error_msg)
            return {"error": error_msg}

        try:
            logger.info(f"ImageGenius is generating image for prompt: '{image_prompt}'")

            response = await litellm.aimage_generation(
                model=settings.LITELLM_IMAGE_MODEL,
                prompt=image_prompt,
                # Pass credentials directly. For Azure, this is often required.
                api_key=settings.AZURE_API_KEY_DALLE,
                api_base=settings.AZURE_API_BASE_DALLE,
                api_version=settings.AZURE_API_VERSION_DALLE,
            )

            if (
                response
                and hasattr(response, "data")
                and response.data
                and hasattr(response.data[0], "url")
            ):
                image_url = response.data[0].url
                logger.success(f"ImageGenius successfully generated an image.")

                # Return a structured output for the calling agent.
                return {
                    "status": "success",
                    "image_url": image_url,
                    "image_prompt": image_prompt,
                }
            else:
                error_msg = f"Image generation API returned an unexpected response format: {response}"
                logger.error(error_msg)
                return {"error": error_msg}

        except Exception as e:
            error_msg = f"Image generation failed for prompt '{image_prompt}': {str(e)}"
            logger.exception(error_msg)
            return {"error": error_msg}

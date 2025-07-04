# parsec-backend/app/agents/image_genius.py
import litellm
from loguru import logger
from typing import Dict, Any, Tuple, List

from ..services.workspace_service import WorkspaceService
from ..core.config import settings

class ImageGenius:
    """A specialist agent for generating images and placing them on the canvas."""

    def __init__(self, workspace_service: WorkspaceService):
        self.workspace = workspace_service
        logger.info("ImageGenius specialist initialized.")

    async def generate_and_place_image(self, prompt: str) -> Tuple[Dict[str, Any], List[str]]:
        """
        Generates an image and returns the command and the new element's ID.
        """
        logger.info(f"ImageGenius received prompt: '{prompt}'")
        try:
            logger.info(f"Calling LiteLLM with image model '{settings.LITELLM_IMAGE_MODEL}'.")
            
            response = litellm.image_generation(
                model=settings.LITELLM_IMAGE_MODEL, prompt=prompt,
                api_key=settings.AZURE_API_KEY_DALLE, api_base=settings.AZURE_API_BASE_DALLE,
                api_version=settings.AZURE_API_VERSION_DALLE
            )

            image_url = response.data[0].url
            logger.success(f"Successfully generated image. URL: {image_url}")

            payload = { "element_type": "image", "prompt": prompt, "src": image_url, "x": 50, "y": 50 }
            new_element = self.workspace.create_element_from_payload(payload)

            if new_element:
                logger.info(f"Created ImageElement with ID: {new_element.id}")
                command = { "type": "element_created", "payload": new_element.model_dump() }
                return command, [new_element.id]
            else:
                raise Exception("WorkspaceService failed to create the image element.")

        except Exception as e:
            logger.exception(f"An error occurred during image generation or placement: {e}")
            return {}, []
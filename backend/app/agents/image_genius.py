# parsec-backend/app/agents/image_genius.py
import litellm
from loguru import logger
from typing import Dict, Any, Tuple, List, Optional

from ..services.workspace_service import WorkspaceService
from ..core.config import settings
from .base_agent import BaseAgent
from .shared_tools import CommonCanvasTools # Although not used for tools, it's part of the base signature

class ImageGenius(BaseAgent):
    """
    A specialist agent for generating images from a text prompt and placing them on the canvas.
    """
    def __init__(self, workspace_service: WorkspaceService, **kwargs):
        # We pass common_tools through to the base class, even if we don't use it here.
        super().__init__(agent_name="ImageGenius", **kwargs)
        # This agent uses a direct API call, not the tool-use framework.
        self.workspace = workspace_service

    async def handle_task(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        The primary entry point for the ImageGenius. It generates an image and returns
        the command to create the new element on the canvas.
        """
        logger.info(f"ImageGenius received task: '{prompt}'")
        try:
            logger.info(f"Calling LiteLLM with image model '{settings.LITELLM_IMAGE_MODEL}'.")
            
            # Direct call to the image generation API
            response = await litellm.aimage_generation(
                model=settings.LITELLM_IMAGE_MODEL, 
                prompt=prompt,
                # Azure-specific settings are pulled from environment variables by litellm
            )

            image_url = response.data[0].url
            logger.success(f"Successfully generated image. URL: {image_url}")

            # Create the new image element via the workspace service
            payload = {
                "element_type": "image",
                "prompt": prompt,
                "src": image_url,
                "x": 50, # Default position
                "y": 50,
                # Width/height will be set by the element's default model values
            }
            new_element = self.workspace.create_element_from_payload(payload)

            if new_element:
                logger.info(f"Created ImageElement with ID: {new_element.id}")
                command = {"type": "ELEMENT_CREATED", "payload": new_element.model_dump()}
                # The handle_task method must always return a list of commands
                return [command]
            else:
                raise Exception("WorkspaceService failed to create the image element after generation.")

        except Exception as e:
            logger.exception(f"An error occurred during image generation or placement: {e}")
            return []
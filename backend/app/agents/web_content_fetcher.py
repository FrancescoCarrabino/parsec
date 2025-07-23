import httpx
from bs4 import BeautifulSoup
from loguru import logger
from typing import Dict, Any, List, Callable, Coroutine

from .models import Agent


class WebContentFetcher(Agent):
    """
    A simple, expert agent that fetches and cleans the textual content from a public URL.
    """

    @property
    def name(self) -> str:
        return "WebContentFetcher"

    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "Extracts the primary text content from a single public webpage URL. It's effective for articles and blog posts.",
            "input": "A single, valid, public URL string as the objective.",
            "output": "A dictionary containing the clean text content under the key 'text_content' and the source URL.",
            "limitations": "Cannot access pages behind logins, paywalls, or complex JavaScript-rendered sites.",
        }

    # This agent has one direct purpose, so it doesn't need an internal tool-calling loop.
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
        The objective for this agent is the URL itself. It directly calls its fetching logic.
        It accepts the standard agent arguments but does not use 'invoke_agent'.
        """
        url = objective.strip()
        logger.info(f"Agent '{self.name}' activated to fetch URL: '{url}'")

        if not url or not url.startswith(("http://", "https://")):
            error_msg = (
                f"Invalid URL provided: '{url}'. URL must be a valid web address."
            )
            logger.error(error_msg)
            return {"status": "failed", "error": error_msg}

        # --- Direct Execution of Fetching Logic ---
        try:
            # The internal implementation is already async and well-written, so we just call it.
            await send_status_update(
                "INVOKING_TOOL",
                f"Using the tool _fetch_and_clean_url_content...",
                {"target_tool": "_fetch_and_clean_url_content"},
            )

            return await self._fetch_and_clean_url_content(url=url)
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            return {
                "status": "failed",
                "error": f"An error occurred while fetching web content: {str(e)}",
            }

    async def _fetch_and_clean_url_content(self, url: str) -> Dict[str, Any]:
        """
        Fetches HTML from a URL, cleans it, and returns the text content.
        This internal logic is excellent and requires no changes.
        """
        logger.info(f"Fetching and cleaning content from: '{url}'")
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
                response = await client.get(url, headers=headers)
                response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")
            for element in soup(
                [
                    "script",
                    "style",
                    "nav",
                    "footer",
                    "aside",
                    "header",
                    "form",
                    "button",
                ]
            ):
                element.decompose()

            text = soup.get_text(separator="\n", strip=True)
            clean_text = "\n".join(line for line in text.splitlines() if line.strip())

            logger.success(f"Successfully fetched and cleaned content from {url}.")
            return {"status": "success", "text_content": clean_text, "source_url": url}
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP error occurred while fetching {url}: {e.response.status_code} {e.response.reason_phrase}"
            logger.error(error_msg)
            return {"status": "failed", "error": error_msg}
        except httpx.RequestError as e:
            error_msg = f"Network or request error while fetching {url}: {str(e)}"
            logger.error(error_msg)
            return {"status": "failed", "error": error_msg}
        except Exception as e:
            error_msg = f"An unexpected error occurred while processing content from {url}: {str(e)}"
            logger.exception(error_msg)
            return {"status": "failed", "error": error_msg}

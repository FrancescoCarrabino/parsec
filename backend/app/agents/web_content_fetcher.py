# backend/app/agents/web_content_fetcher.py
import httpx # Use an async-native library
from bs4 import BeautifulSoup # For HTML parsing
from loguru import logger
from typing import Dict, Any, List, Callable
import uuid # Import uuid for potential ID generation if needed, though not used here.

from .models import Agent, Tool
# No WorkspaceService needed for this agent as it doesn't modify workspace state.

class WebContentFetcher(Agent):
    """
    A simple, expert agent that fetches and cleans the textual content from a public URL.
    It takes the URL as its objective and returns the cleaned text.
    It does not commit history.
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
            "limitations": "Cannot access pages behind logins, paywalls, or complex JavaScript-rendered sites. Only processes HTML content; ignores images, videos, etc."
        }

    @property
    def tools(self) -> List[Tool]:
        # Define the tool that maps to fetching URL content.
        # This helps the LLM understand the agent's capability.
        return [
            Tool(function={
                "name": "fetch_and_clean_url_content",
                "description": "Fetches the HTML from a URL, cleans it by removing scripts, styles, and irrelevant tags, and returns the main textual content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "The full, valid URL of the webpage to fetch."},
                    },
                    "required": ["url"],
                },
            })
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]:
        # Map the tool name to its implementation.
        return {
            "fetch_and_clean_url_content": self._fetch_and_clean_url_content,
        }

    async def run_task(self, objective: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        The objective for this agent is the URL itself. It directly calls its fetching logic.
        No context needed for this simple agent's core function.
        Does not commit history.
        """
        url = objective.strip() # The objective IS the URL.
        logger.info(f"Agent '{self.name}' activated to fetch URL: '{url}'")

        # --- Input Validation ---
        if not url or not url.startswith(('http://', 'https://')):
            error_msg = f"Invalid URL provided: '{url}'. URL must be a valid web address starting with http:// or https://."
            logger.error(error_msg)
            return {"error": error_msg}

        # --- Direct Execution of Fetching Logic ---
        # This agent does not use LLM tool selection because its task is singular and direct.
        # The objective is the input parameter itself.
        try:
            # Call the internal implementation directly.
            response_data = await self._fetch_and_clean_url_content(url=url)
            return response_data
            
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during task execution.")
            # Return error in a standardized format
            return {"error": f"An error occurred while fetching web content: {str(e)}"}

    # --- The actual web fetching and cleaning logic ---
    async def _fetch_and_clean_url_content(self, url: str) -> Dict[str, Any]:
        """
        Fetches HTML from a URL, cleans it, and returns the text content.
        """
        logger.info(f"Fetching and cleaning content from: '{url}'")
        
        try:
            # Use httpx for efficient asynchronous HTTP requests
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                # Set a common User-Agent to mimic a browser and avoid potential blocks
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                response = await client.get(url, headers=headers)
                response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)

            # Parse HTML content with BeautifulSoup
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove common non-content tags
            for element in soup(["script", "style", "nav", "footer", "aside", "header", "form", "button"]):
                element.decompose()
            
            # Extract text and clean up whitespace
            # Use get_text with separator='\n' for better spacing between blocks, and strip=True to clean leading/trailing whitespace per element.
            text = soup.get_text(separator='\n', strip=True)
            
            # Further clean up by removing multiple blank lines
            clean_text = '\n'.join(line for line in text.splitlines() if line.strip())
            
            logger.success(f"Successfully fetched and cleaned content from {url}.")
            
            # Return data in a standardized format
            return {
                "status": "success",
                "text_content": clean_text,
                "source_url": url
            }

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP error occurred while fetching {url}: {e.response.status_code} {e.response.reason_phrase}"
            logger.error(error_msg)
            return {"error": error_msg}
        except httpx.RequestError as e: # Catch other httpx errors like connection issues
             error_msg = f"Network or request error while fetching {url}: {str(e)}"
             logger.error(error_msg)
             return {"error": error_msg}
        except Exception as e: # Catch any other unexpected errors during parsing or processing
            error_msg = f"An unexpected error occurred while processing content from {url}: {str(e)}"
            logger.exception(error_msg) # Log the full traceback
            return {"error": error_msg}
from loguru import logger
from typing import Dict, Any, List, Callable, Optional
import uuid
import tempfile
import os
import base64
import re # <-- Import regular expressions
import asyncio

from .models import Agent
from ..services.workspace_service import WorkspaceService
from ..services.storage_service import StorageService
from ..services.session_manager import session_manager

class DataAnalystAgent(Agent):
    """
    An agent specializing in interactive data analysis. It uses a sandboxed
    Jupyter environment to load, analyze, and visualize data from user-provided files.
    """
    def __init__(self, workspace_service: WorkspaceService, storage_service: StorageService):
        self._workspace = workspace_service
        self._storage = storage_service

    # ... (name, description, tools, available_functions properties are the same)
    @property
    def name(self) -> str: return "DataAnalystAgent"
    @property
    def description(self) -> Dict[str, str]:
        return {
            "purpose": "To perform interactive data analysis on user-provided spreadsheets (CSV, Excel). It can create charts, tables, and summaries based on a conversational interaction with the user.",
            "input": "A natural language objective that includes a reference to an asset ID in the format `(asset: <asset_id>)`.",
            "output": "A combination of conversational messages, generated code, and ultimately, image assets (charts) placed on the canvas.",
            "limitations": "Currently operates on one spreadsheet at a time. Cannot yet join data from multiple sources."
        }
    @property
    def tools(self) -> List[Any]: return []
    @property
    def available_functions(self) -> Dict[str, Callable]: return {}


    def _parse_asset_id(self, objective: str) -> Optional[str]:
        """Extracts the asset ID from the objective string using regex."""
        match = re.search(r'\(asset:\s*([a-zA-Z0-9_-]+)\)', objective)
        if match:
            return match.group(1)
        return None

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable,
        send_status_update: Callable
    ) -> Dict[str, Any]:
        logger.info(f"Agent '{self.name}' activated with objective: '{objective}'")
        
        asset_id = self._parse_asset_id(objective)
        if not asset_id:
            error_msg = "Could not find a valid asset ID in the format `(asset: <id>)` in the objective."
            logger.error(error_msg)
            await send_status_update("ERROR", error_msg)
            return {"status": "failed", "error": error_msg}

        asset = self._workspace.get_asset_by_id(asset_id)
        if not asset:
            error_msg = f"Asset with ID '{asset_id}' not found in the workspace."
            logger.error(error_msg)
            await send_status_update("ERROR", error_msg)
            return {"status": "failed", "error": error_msg}
            
        file_content = self._storage.download_file_by_url(asset.url)
        if not file_content:
            raise RuntimeError("Failed to download asset content from storage.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{asset.name}") as tmp_file:
            tmp_file.write(file_content)
            local_asset_path = tmp_file.name

        await send_status_update("PREPARING", "Setting up secure analysis environment...")
        session = session_manager.create_session()
        if not session:
            error_msg = "Failed to create a secure analysis session."
            await send_status_update("ERROR", error_msg)
            return {"status": "failed", "error": error_msg}
            
        try:
            # --- 1. Download asset to a temporary local file ---
            # Note: This part needs a `download_file_by_url` method in StorageService.
            # For now, we'll assume it exists and returns a local path.
            # Let's create a placeholder for it.
            with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{asset.name}") as tmp_file:
                # In a real implementation, you'd download the content from asset.url here.
                # tmp_file.write(downloaded_content)
                local_asset_path = tmp_file.name
            
            logger.info(f"Asset '{asset.name}' temporarily stored at '{local_asset_path}'.")

            # --- 2. Copy the file into the session ---
            container_dest_path = f"/app/{asset.name}"
            copy_success = session_manager.copy_file_to_session(session.session_id, local_asset_path, container_dest_path)
            os.remove(local_asset_path) # Clean up the temporary local file

            if not copy_success:
                raise RuntimeError("Failed to copy asset file into the analysis session.")

            await send_status_update("THINKING", "Analyzing spreadsheet structure...")
            
            # --- 3. Run initial analysis code ---
            initial_code = f"""
import pandas as pd
try:
    file_path = '{container_dest_path}'
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)
    print("Successfully loaded the data. Here are the first 5 rows and column info:")
    print(df.head().to_markdown())
    print("\\nColumn Info:")
    df.info(buf=open('info.txt', 'w'))
    with open('info.txt', 'r') as f:
        print(f.read())
except Exception as e:
    print(f"ERROR: Could not read the spreadsheet. Details: {{e}}")
"""
            initial_result = session_manager.execute_code(session.session_id, initial_code)
            
            # This is where we would send the initial_result['stdout'] to the user in the chat.
            logger.info(f"Initial analysis result: \n{initial_result['stdout']}")
            
            # --- 4. Placeholder for the conversational loop ---
            await send_status_update("AWAITING_FEEDBACK", "I've loaded the data. Ready for your instructions.")
            # In the full implementation, we'd start a loop here, waiting for user messages.
            # For now, we'll just simulate a successful completion.
            await asyncio.sleep(2) # Simulate user interaction
            
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed during its task.")
            await send_status_update("ERROR", f"A critical error occurred: {e}")
            return {"status": "failed", "error": str(e)}
        finally:
            logger.info(f"Closing analysis session {session.session_id}.")
            session_manager.close_session(session.session_id)

        return {"status": "success", "result": "Analysis complete."}
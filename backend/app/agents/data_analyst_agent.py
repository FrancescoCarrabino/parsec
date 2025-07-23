from loguru import logger
from typing import Dict, Any, List, Callable, Optional, Coroutine
import uuid, tempfile, os, re, asyncio, json, base64, litellm
from fastapi import WebSocket

from ..core.config import settings
from .models import Agent, Tool
from ..services.workspace_service import WorkspaceService
from ..services.storage_service import StorageService
from ..services.session_manager import session_manager
from .prompt_library import get_data_analyst_system_prompt

class DataAnalystAgent(Agent):
    def __init__(self, workspace_service: WorkspaceService, storage_service: StorageService):
        self._workspace = workspace_service
        self._storage = storage_service

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
    def tools(self) -> List[Tool]:
        return [
            Tool(function={
                "name": "send_chat_message",
                "description": "Send a text message to the user.",
                "parameters": {
                    "type": "object",
                    "properties": {"message": {"type": "string", "description": "The message to send."}},
                    "required": ["message"]
                }
            }),
            Tool(function={
                "name": "generate_and_execute_code",
                "description": "Generate and execute a Python code snippet in the sandboxed environment.",
                "parameters": {
                    "type": "object",
                    "properties": {"code": {"type": "string", "description": "The Python code to execute."}},
                    "required": ["code"]
                }
            }),
            Tool(function={
                "name": "place_chart_on_canvas",
                "description": "Call this as the final step. It takes the generated 'output.png', uploads it, and places it as an image on the main canvas.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number", "description": "The desired x-coordinate for the top-left corner of the chart on the canvas."},
                        "y": {"type": "number", "description": "The desired y-coordinate for the top-left corner of the chart on the canvas."},
                        "width": {"type": "number", "description": "The desired width of the chart image on the canvas."},
                        "height": {"type": "number", "description": "The desired height of the chart image on the canvas."}
                    },
                    "required": ["x", "y", "width", "height"]
                }
            })
        ]

    @property
    def available_functions(self) -> Dict[str, Callable]: return {}

    def _parse_asset_id(self, objective: str) -> Optional[str]:
        match = re.search(r'\(asset:\s*([a-zA-Z0-9_-]+)\)', objective)
        return match.group(1) if match else None

    async def run_task(
        self,
        objective: str,
        context: Dict[str, Any],
        invoke_agent: Callable,
        send_update_to_client: Callable[[Dict], Coroutine[Any, Any, None]]
    ) -> Dict[str, Any]:
        session, asset_id = None, self._parse_asset_id(objective)
        message_queue = context["message_queue"]
        agent_service_ref = context["agent_service_ref"]
        websocket = context["websocket"]
        
        try:
            # --- 1. SETUP AND INITIAL ANALYSIS ---
            if not asset_id: raise ValueError("Could not find a valid asset ID in the prompt.")
            asset = self._workspace.get_asset_by_id(asset_id)
            if not asset: raise ValueError(f"Asset with ID '{asset_id}' not found.")
            
            await send_update_to_client({"type": "AGENT_STATUS_UPDATE", "payload": {"status": "PREPARING", "message": "Setting up secure analysis environment..."}})
            session = session_manager.create_session()
            if not session: raise RuntimeError("Failed to create a secure analysis session.")
            
            # Register the session with the AgentService so it can be managed
            agent_service_ref.register_interactive_session(session.session_id, websocket, asyncio.current_task(), message_queue)
            await send_update_to_client({"type": "ANALYSIS_SESSION_STARTED", "payload": {"sessionId": session.session_id}})
            
            file_content = self._storage.download_file_by_url(asset.url)
            if not file_content: raise RuntimeError("Failed to download asset content.")
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{asset.name}") as tmp:
                tmp.write(file_content)
                local_path = tmp.name
            
            container_path = f"/app/{asset.name}"
            if not session_manager.copy_file_to_session(session.session_id, local_path, container_path):
                raise RuntimeError("Failed to copy asset file into session.")
            os.remove(local_path)

            system_prompt = get_data_analyst_system_prompt(asset.name)

            # 2. Construct a more detailed first user message that guides the AI.
            initial_user_message = f"""
            My objective is: "{objective}".

            Please begin. Your first task is to load the data from `/app/{asset.name}` into a pandas DataFrame named `df` and then print the `df.head()` and `df.info()` to understand the data structure. Use your `generate_and_execute_code` tool now.
            """

            # 3. Start the conversation with this guided first message.
            conversation_history = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": initial_user_message}
            ]
            
            while True:
                logger.info(f"Session {session.session_id}: Awaiting next action from LLM...")
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=conversation_history, tools=[t.model_dump() for t in self.tools],
                    api_key=settings.AZURE_API_KEY_TEXT, api_base=settings.AZURE_API_BASE_TEXT, api_version=settings.AZURE_API_VERSION_TEXT
                )
                
                response_message = response.choices[0].message
                conversation_history.append(response_message)
                
                if not response_message.tool_calls:
                    # If the model wants to just chat without calling a tool
                    if response_message.content:
                        await send_update_to_client({"type": "AI_CHAT_MESSAGE", "payload": {"id": str(uuid.uuid4()), "text": response_message.content}})
                        user_feedback = await message_queue.get()
                        conversation_history.append({"role": "user", "content": user_feedback})
                    continue

                # --- 3. EXECUTE THE CHOSEN TOOL ---
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    if function_name == "send_chat_message":
                        msg_text = function_args.get('message')
                        await send_update_to_client({"type": "AI_CHAT_MESSAGE", "payload": {"id": str(uuid.uuid4()), "text": msg_text}})
                        user_feedback = await message_queue.get()
                        conversation_history.append({"role": "tool", "tool_call_id": tool_call.id, "name": function_name, "content": f"Message sent and user replied: '{user_feedback}'"})
                        conversation_history.append({"role": "user", "content": user_feedback})
                        
                    elif function_name == "generate_and_execute_code":
                        code_to_run = function_args.get('code')
                        await send_update_to_client({"type": "ANALYSIS_CODE_UPDATED", "payload": {"code": code_to_run}})
                        exec_result = session_manager.execute_code(session.session_id, code_to_run)
                        tool_response = exec_result.get("stdout", "Code executed with no output.")
                        conversation_history.append({"role": "tool", "tool_call_id": tool_call.id, "name": function_name, "content": tool_response})

                    elif function_name == "place_chart_on_canvas":
                        await send_update_to_client({"type": "AGENT_STATUS_UPDATE", "payload": {"status": "EXECUTING_TASK", "message": "Placing chart on canvas..."}})

                        chart_bytes = session_manager.get_file_from_session(session.session_id, "/app/output.png")
                        if not chart_bytes: raise ValueError("Could not retrieve final chart image.")

                        final_asset_path = None
                        try:
                            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as chart_file:
                                chart_file.write(chart_bytes)
                                final_asset_path = chart_file.name
                            
                            # --- THIS IS THE CORRECTED FLOW ---
                            
                            # Step 1: Call the StorageService. Its ONLY job is to upload the file and return a URL.
                            upload_details = self._storage.upload_file_from_path(
                                final_asset_path, "image/png", f"chart-{uuid.uuid4().hex[:6]}.png"
                            )

                            # Step 2: The Agent, which knows about the workspace, now calls the WorkspaceService
                            # to create the database record for the asset, using the URL from Step 1.
                            asset_data = {
                                "name": upload_details["name"],
                                "asset_type": "image",
                                "mime_type": "image/png",
                                "url": upload_details["url"],
                            }
                            new_asset = self._workspace.create_asset(asset_data)
                            if not new_asset: raise RuntimeError("Failed to create workspace asset record.")

                            # Step 3: Broadcast the asset creation.
                            await send_update_to_client({ "type": "ASSET_CREATED", "payload": new_asset.model_dump() })

                            # Step 4: Create the ImageElement on the canvas.
                            image_element_payload = {
                                "element_type": "image",
                                "src": new_asset.url,
                                "x": 100, "y": 100, "width": 600, "height": 400,
                            }
                            new_element = self._workspace.create_element_from_payload(image_element_payload)
                            if not new_element: raise RuntimeError("Failed to create image element on the canvas.")

                            # Step 5: Broadcast the element creation.
                            await send_update_to_client({ "type": "ELEMENT_CREATED", "payload": new_element.model_dump() })
                            
                            logger.success(f"Session finished. Chart placed on canvas with element ID {new_element.id}")
                            return {"status": "success"}

                        finally:
                            # Cleanup of the temp file remains the same and is correct.
                            if final_asset_path and os.path.exists(final_asset_path):
                                os.remove(final_asset_path)

        except asyncio.CancelledError:
            logger.warning(f"Analysis task for session {session.session_id if session else 'N/A'} was cancelled.")
            return {"status": "cancelled"}
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed catastrophically.")
            await send_update_to_client({"type": "ERROR", "payload": {"message": str(e)}})
            return {"status": "failed", "error": str(e)}
        finally:
            if session:
                logger.info(f"Closing analysis session {session.session_id}.")
                await send_update_to_client({"type": "ANALYSIS_SESSION_ENDED", "payload": {}})
                session_manager.close_session(session.session_id)
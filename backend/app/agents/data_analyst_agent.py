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
        send_update_to_client: Callable[[str, str, dict], Coroutine[Any, Any, None]]
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
            
            await send_update_to_client("AGENT_STATUS_UPDATE", "Setting up secure analysis environment...", {"status": "PREPARING"})
            session = session_manager.create_session()
            if not session: raise RuntimeError("Failed to create a secure analysis session.")
            
            # Register the session with the AgentService so it can be managed
            agent_service_ref.register_interactive_session(session.session_id, websocket, asyncio.current_task(), message_queue)
            await send_update_to_client("ANALYSIS_SESSION_STARTED", f"Session started: {session.session_id}", {"sessionId": session.session_id})
            
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

            # --- INTERACTIVE LOOP ---
            user_done = False
            explained_data = False
            while not user_done:
                logger.info(f"Session {session.session_id}: Awaiting next action from LLM...")
                response = await litellm.acompletion(
                    model=settings.LITELLM_TEXT_MODEL, messages=conversation_history, tools=[t.model_dump() for t in self.tools],
                    api_key=settings.AZURE_API_KEY_TEXT, api_base=settings.AZURE_API_BASE_TEXT, api_version=settings.AZURE_API_VERSION_TEXT
                )
                response_message = response.choices[0].message
                conversation_history.append(response_message)

                # If the model wants to just chat without calling a tool
                if not response_message.tool_calls:
                    if response_message.content:
                        await send_update_to_client("AI_CHAT_MESSAGE", response_message.content, {"id": str(uuid.uuid4())})
                        user_feedback = await message_queue.get()
                        # Check if user wants to finish
                        if user_feedback.strip().lower() in ["finish", "done", "exit", "quit"]:
                            user_done = True
                            await send_update_to_client("AI_CHAT_MESSAGE", "Session ended as per your request. If you need further analysis, please start a new session.", {"id": str(uuid.uuid4())})
                            break
                        # Only append user message if not ending session
                        if not user_done:
                            conversation_history.append({"role": "user", "content": user_feedback})
                    continue

                # --- 3. EXECUTE THE CHOSEN TOOL(S) ---
                tool_call_results = []
                user_ended = False
                handled_tool_call_ids = set()
                for i, tool_call in enumerate(response_message.tool_calls):
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    tool_response = None
                    tool_cancelled = False

                    if user_ended:
                        tool_call_results.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": function_name,
                            "content": "User ended the session before tool execution."
                        })
                        handled_tool_call_ids.add(tool_call.id)
                        continue

                    if function_name == "send_chat_message":
                        msg_text = function_args.get('message')
                        await send_update_to_client("AI_CHAT_MESSAGE", msg_text, {"id": str(uuid.uuid4())})
                        user_feedback = await message_queue.get()
                        if user_feedback.strip().lower() in ["finish", "done", "exit", "quit"]:
                            user_done = True
                            tool_response = "User ended the session before tool execution."
                            tool_cancelled = True
                            user_ended = True
                            await send_update_to_client("AI_CHAT_MESSAGE", "Session ended as per your request. If you need further analysis, please start a new session.", {"id": str(uuid.uuid4())})
                        else:
                            tool_response = f"Message sent and user replied: '{user_feedback}'"
                            # Only append user message after all tool messages are appended
                        tool_call_results.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": function_name,
                            "content": tool_response
                        })
                        handled_tool_call_ids.add(tool_call.id)
                        if tool_cancelled:
                            break

                    elif function_name == "generate_and_execute_code":
                        code_to_run = function_args.get('code')
                        await send_update_to_client("ANALYSIS_CODE_UPDATED", "Code updated", {"code": code_to_run})
                        exec_result = session_manager.execute_code(session.session_id, code_to_run)
                        tool_response = exec_result.get("stdout", "Code executed with no output.")
                        error_output = exec_result.get("stderr")
                        if error_output:
                            logger.error(f"Code execution error: {error_output}")
                            await send_update_to_client(
                                "AI_CHAT_MESSAGE",
                                f"Error during code execution:\n{error_output}",
                                {"id": str(uuid.uuid4())}
                            )
                        tool_call_results.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": function_name,
                            "content": tool_response
                        })
                        handled_tool_call_ids.add(tool_call.id)
                        if not explained_data:
                            explained_data = True
                            explanation = ("I've loaded your data and here is a preview. "
                                "You can now ask me to generate a chart, filter the data, perform analysis, or anything else you need. "
                                "When you're done, just say 'finish'. What would you like to do next?")
                            await send_update_to_client("AI_CHAT_MESSAGE", explanation, {"id": str(uuid.uuid4())})
                            user_feedback = await message_queue.get()
                            if user_feedback.strip().lower() in ["finish", "done", "exit", "quit"]:
                                user_done = True
                                tool_call_results[-1]["content"] = "User ended the session after code execution."
                                user_ended = True
                                await send_update_to_client("AI_CHAT_MESSAGE", "Session ended as per your request. If you need further analysis, please start a new session.", {"id": str(uuid.uuid4())})
                                break
                            # Only append user message after all tool messages are appended

                    elif function_name == "place_chart_on_canvas":
                        await send_update_to_client("AGENT_STATUS_UPDATE", "Placing chart on canvas...", {"status": "EXECUTING_TASK"})
                        chart_bytes = session_manager.get_file_from_session(session.session_id, "/app/output.png")
                        if not chart_bytes: raise ValueError("Could not retrieve final chart image.")
                        final_asset_path = None
                        try:
                            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as chart_file:
                                chart_file.write(chart_bytes)
                                final_asset_path = chart_file.name
                            upload_details = self._storage.upload_file_from_path(
                                final_asset_path, "image/png", f"chart-{uuid.uuid4().hex[:6]}.png"
                            )
                            asset_data = {
                                "name": upload_details["name"],
                                "asset_type": "image",
                                "mime_type": "image/png",
                                "url": upload_details["url"],
                            }
                            new_asset = self._workspace.create_asset(asset_data)
                            if not new_asset: raise RuntimeError("Failed to create workspace asset record.")
                            await send_update_to_client("ASSET_CREATED", "Asset created", new_asset.model_dump())
                            image_element_payload = {
                                "element_type": "image",
                                "src": new_asset.url,
                                "x": 100, "y": 100, "width": 600, "height": 400,
                            }
                            new_element = self._workspace.create_element_from_payload(image_element_payload)
                            if not new_element: raise RuntimeError("Failed to create image element on the canvas.")
                            await send_update_to_client("ELEMENT_CREATED", "Element created", new_element.model_dump())
                            await send_update_to_client("AGENT_STATUS_UPDATE", "Chart placement complete.", {"status": "FINISHED"})
                            await send_update_to_client("CLEAR_AGENT_STATUS", "Clear agent status")
                            followup = ("I've placed the chart on the canvas. You can ask me to modify the chart, create a new one, or perform further analysis. If you're finished, just say 'finish'. What would you like to do next?")
                            await send_update_to_client("AI_CHAT_MESSAGE", followup, {"id": str(uuid.uuid4())})
                            user_feedback = await message_queue.get()
                            if user_feedback.strip().lower() in ["finish", "done", "exit", "quit"]:
                                user_done = True
                                tool_response = "User ended the session after chart placement."
                                tool_cancelled = True
                                user_ended = True
                                await send_update_to_client("AI_CHAT_MESSAGE", "Session ended as per your request. If you need further analysis, please start a new session.", {"id": str(uuid.uuid4())})
                            else:
                                tool_response = "Chart placed on canvas and user replied: '" + user_feedback + "'"
                                # Only append user message after all tool messages are appended
                            tool_call_results.append({
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": function_name,
                                "content": tool_response
                            })
                            handled_tool_call_ids.add(tool_call.id)
                            if tool_cancelled:
                                break
                        finally:
                            if final_asset_path and os.path.exists(final_asset_path):
                                os.remove(final_asset_path)
                    else:
                        tool_call_results.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": function_name,
                            "content": "Tool not implemented."
                        })
                        handled_tool_call_ids.add(tool_call.id)

                # After the loop, ensure all tool_call_ids are handled
                all_tool_call_ids = {tc.id for tc in response_message.tool_calls}
                missing_tool_call_ids = all_tool_call_ids - handled_tool_call_ids
                for tc in response_message.tool_calls:
                    if tc.id in missing_tool_call_ids:
                        tool_call_results.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": tc.function.name,
                            "content": "User ended the session before tool execution."
                        })

                for tool_msg in tool_call_results:
                    conversation_history.append(tool_msg)

                # Now, after all tool messages are appended, append user message if needed
                if not user_ended and not user_done:
                    # Find the last user_feedback in this loop
                    if 'user_feedback' in locals() and user_feedback.strip().lower() not in ["finish", "done", "exit", "quit"]:
                        conversation_history.append({"role": "user", "content": user_feedback})

                # If the user ended the session, break the main loop immediately after appending tool messages
                if user_ended or user_done:
                    break

        except asyncio.CancelledError:
            logger.warning(f"Analysis task for session {session.session_id if session else 'N/A'} was cancelled.")
            return {"status": "cancelled"}
        except Exception as e:
            logger.exception(f"Agent '{self.name}' failed catastrophically.")
            await send_update_to_client("ERROR", str(e))
            return {"status": "failed", "error": str(e)}
        finally:
            if session:
                logger.info(f"Closing analysis session {session.session_id}.")
                await send_update_to_client("ANALYSIS_SESSION_ENDED", "Session ended")
                session_manager.close_session(session.session_id)
import docker
from docker.models.containers import Container
from docker.errors import NotFound, APIError
from loguru import logger
import uuid
import tarfile
import io
import json
import websocket # <-- Add this import
from typing import Dict, Optional

from dataclasses import dataclass

@dataclass
class InteractiveSession:
    session_id: str
    container: Container
    kernel_url: str
    kernel_id: Optional[str] = None # We will store the kernel ID here
    ws: Optional[websocket.WebSocket] = None # The active WebSocket connection

class SessionManager:
    """
    Manages the lifecycle of interactive Jupyter kernel sessions running in Docker.
    """
    def __init__(self):
        try:
            self.docker_client = docker.from_env()
            self.active_sessions: Dict[str, InteractiveSession] = {}
            logger.info("SessionManager initialized and connected to Docker daemon.")
            self._cleanup_stale_containers()
        except Exception as e:
            logger.critical(f"Failed to connect to Docker daemon: {e}")
            self.docker_client = None

    def create_session(self, image_name: str = "jupyter-kernel:latest") -> Optional[InteractiveSession]:
        if not self.docker_client:
            logger.error("Docker client not available. Cannot create session.")
            return None

        session_id = str(uuid.uuid4())
        container_name = f"parsec-session-{session_id}"
        
        logger.info(f"Attempting to create session '{session_id}' with container '{container_name}'...")
        try:
            container = self.docker_client.containers.run(
                image=image_name,
                name=container_name,
                ports={'8888/tcp': None},
                detach=True,
                auto_remove=True,
            )
            
            container.reload()
            host_port = container.attrs['NetworkSettings']['Ports']['8888/tcp'][0]['HostPort']
            kernel_url = f"http://localhost:{host_port}"
            
            new_session = InteractiveSession(
                session_id=session_id,
                container=container,
                kernel_url=kernel_url
            )
            
            self.active_sessions[session_id] = new_session
            logger.success(f"Session '{session_id}' created successfully. Kernel is at {kernel_url}")
            return new_session

        except APIError as e:
            logger.error(f"Docker API error during session creation: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to create session '{session_id}': {e}")
            try:
                if 'container' in locals(): container.stop()
            except: pass
            return None

    def get_session(self, session_id: str) -> Optional[InteractiveSession]:
        return self.active_sessions.get(session_id)

    def copy_file_to_session(self, session_id: str, src_path: str, dest_path: str) -> bool:
        """
        Copies a local file into a running session's container's filesystem.
        """
        session = self.get_session(session_id)
        if not session:
            logger.error(f"Cannot copy file: Session '{session_id}' not found.")
            return False

        try:
            # Docker SDK's put_archive requires a tar archive in memory
            in_memory_tar = io.BytesIO()
            with tarfile.open(fileobj=in_memory_tar, mode='w') as tar:
                tar.add(src_path, arcname=dest_path.split('/')[-1])
            in_memory_tar.seek(0)
            
            # Put the archive into the container's destination directory
            dest_dir = '/'.join(dest_path.split('/')[:-1])
            success = session.container.put_archive(path=dest_dir, data=in_memory_tar)

            if success:
                logger.info(f"Successfully copied '{src_path}' to '{dest_path}' in session '{session_id}'.")
                return True
            else:
                logger.error(f"Failed to copy file to session '{session_id}'.")
                return False
        except Exception as e:
            logger.error(f"Error copying file to session '{session_id}': {e}")
            return False

    def execute_code(self, session_id: str, code: str) -> Optional[Dict]:
        """
        Executes a block of Python code within a session's kernel via WebSocket.
        """
        session = self.get_session(session_id)
        if not session:
            logger.error(f"Cannot execute code: Session '{session_id}' not found.")
            return None

        # --- Step 1: Connect to WebSocket if not already connected ---
        if not session.ws or not session.ws.connected:
            try:
                # Kernel Gateway provides a REST API to list kernels. We just take the first one.
                import requests
                response = requests.get(f"{session.kernel_url}/api/kernels")
                response.raise_for_status()
                session.kernel_id = response.json()[0]['id']
                
                ws_url = f"ws://localhost:{session.kernel_url.split(':')[-1]}/api/kernels/{session.kernel_id}/channels"
                session.ws = websocket.create_connection(ws_url)
                logger.info(f"WebSocket connected for session '{session_id}'.")
            except Exception as e:
                logger.error(f"Failed to establish WebSocket connection for session '{session_id}': {e}")
                return None

        # --- Step 2: Construct and send the Jupyter message ---
        msg_id = str(uuid.uuid4())
        msg = {
            "header": {
                "msg_id": msg_id,
                "username": "parsec",
                "session": session_id,
                "msg_type": "execute_request",
                "version": "5.3",
            },
            "parent_header": {},
            "metadata": {},
            "content": {
                "code": code,
                "silent": False,
                "store_history": True,
                "user_expressions": {},
                "allow_stdin": False,
            },
            "buffers": []
        }
        session.ws.send(json.dumps(msg))
        
        # --- Step 3: Listen for and collect responses ---
        results = {"stdout": "", "figures": []}
        execution_complete = False
        while not execution_complete:
            response_str = session.ws.recv()
            response = json.loads(response_str)
            
            # We only care about messages that are responses to our request
            if response.get("parent_header", {}).get("msg_id") != msg_id:
                continue

            msg_type = response["header"]["msg_type"]
            if msg_type == "stream": # This is stdout/stderr
                results["stdout"] += response["content"]["text"]
            elif msg_type == "display_data": # This is for rich outputs like images
                if "image/png" in response["content"]["data"]:
                    results["figures"].append(response["content"]["data"]["image/png"])
            elif msg_type == "execute_reply": # This signals the end of execution
                execution_complete = True
                if response["content"]["status"] == "error":
                    # Collate traceback for error reporting
                    results["stdout"] += f"ERROR: {response['content']['ename']}\n{response['content']['evalue']}\n"
                    results["stdout"] += "\n".join(response['content']['traceback'])

        logger.info(f"Code execution finished for session '{session_id}'.")
        return results

    def get_file_from_session(self, session_id: str, remote_path: str) -> Optional[bytes]:
        """
        Retrieves a file from a session's container as raw bytes.
        """
        session = self.get_session(session_id)
        if not session:
            logger.error(f"Cannot get file: Session '{session_id}' not found.")
            return None
            
        try:
            bits, stat = session.container.get_archive(remote_path)
            # The result is a tar stream, we need to extract the single file from it.
            with io.BytesIO(b"".join(bits)) as tar_stream:
                with tarfile.open(fileobj=tar_stream, mode='r') as tar:
                    # Assuming only one file in the archive
                    member = tar.getmembers()[0]
                    file_content = tar.extractfile(member).read()
                    logger.info(f"Successfully retrieved file '{remote_path}' from session '{session_id}'.")
                    return file_content
        except Exception as e:
            logger.error(f"Error getting file from session '{session_id}': {e}")
            return None

    def close_session(self, session_id: str) -> bool:
        session = self.active_sessions.get(session_id)
        if session:
            logger.info(f"Closing session '{session_id}'...")
            try:
                if session.ws and session.ws.connected:
                    session.ws.close()
                session.container.stop(timeout=5)
                logger.success(f"Container for session '{session_id}' stopped.")
            except Exception as e:
                logger.error(f"Error during session close for '{session_id}': {e}")
            finally:
                del self.active_sessions[session_id]
            return True
        else:
            logger.warning(f"Attempted to close non-existent session '{session_id}'.")
            return False

    def _cleanup_stale_containers(self):
        if not self.docker_client: return
        stale_containers = self.docker_client.containers.list(all=True, filters={"name": "parsec-session-*"})
        if stale_containers:
            logger.warning(f"Found {len(stale_containers)} stale session containers. Cleaning up...")
            for container in stale_containers:
                try:
                    container.remove(force=True)
                    logger.info(f"Removed stale container: {container.name}")
                except APIError as e:
                    logger.error(f"Error removing stale container {container.name}: {e}")

session_manager = SessionManager()
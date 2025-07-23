import docker
from docker.models.containers import Container
from docker.errors import NotFound, APIError
from loguru import logger
import uuid
import tarfile
import io
import json
import websocket
import time
import re
import requests
from typing import Dict, Optional

from dataclasses import dataclass

# The name of the network shared by your services.
DOCKER_NETWORK_NAME = "parsec-net"

# The port your Nginx proxy is exposed on.
PROXY_PORT = 8889

# The authentication token we set in the Jupyter Dockerfile CMD.
JUPYTER_TOKEN = "parsec-super-secret-token"

@dataclass
class InteractiveSession:
    session_id: str
    container: Container
    kernel_url: str
    kernel_id: Optional[str] = None
    ws: Optional[websocket.WebSocket] = None

class SessionManager:
    """
    Manages the lifecycle of interactive Jupyter Notebook sessions.
    It creates ephemeral Jupyter containers and assumes a persistent reverse proxy
    (like Nginx) is running and routing requests to them.
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
        container_name = f"parsec-jupyter-{session_id}"
            
        logger.info(f"Attempting to create session '{session_id}' with container '{container_name}'...")
        try:
            container = self.docker_client.containers.run(
                image=image_name,
                name=container_name,
                network=DOCKER_NETWORK_NAME,
                detach=True,
                auto_remove=False,
            )
            
            # Health check the container to ensure the Jupyter server started
            self._wait_for_container_log(container, "Jupyter Server.*is running at")
            # The URL points to our stable proxy, with the session ID in the path
            kernel_url = f"http://localhost:{PROXY_PORT}/{session_id}"

            new_session = InteractiveSession(
                session_id=session_id,
                container=container,
                kernel_url=kernel_url
            )
            self.active_sessions[session_id] = new_session
            logger.success(f"Session '{session_id}' created successfully. Proxy URL: {kernel_url}")
            return new_session

        except Exception as e:
            logger.error(f"Failed to create session '{session_id}': {e}")
            try:
                if 'container' in locals():
                    container.remove(force=True)
            except: pass
            return None

    def get_session(self, session_id: str) -> Optional[InteractiveSession]:
        return self.active_sessions.get(session_id)

    def copy_file_to_session(self, session_id: str, src_path: str, dest_path: str) -> bool:
        session = self.get_session(session_id)
        if not session:
            return False
        try:
            in_memory_tar = io.BytesIO()
            with tarfile.open(fileobj=in_memory_tar, mode='w') as tar:
                tar.add(src_path, arcname=dest_path.split('/')[-1])
            in_memory_tar.seek(0)
            
            dest_dir = '/'.join(dest_path.split('/')[:-1])
            success = session.container.put_archive(path=dest_dir, data=in_memory_tar)

            if success:
                logger.info(f"Successfully copied '{src_path}' to '{dest_path}' in session '{session_id}'.")
                return True
            return False
        except Exception as e:
            logger.error(f"Error copying file to session '{session_id}': {e}")
            return False

    def execute_code(self, session_id: str, code: str) -> Optional[Dict]:
        session = self.get_session(session_id)
        if not session:
            return None

        # --- NEW: Use Token Authentication ---
        auth_headers = {'Authorization': f'token {JUPYTER_TOKEN}'}

        if not session.ws or not session.ws.connected:
            try:
                # 1. Create a new kernel via a POST request.
                kernel_create_url = f"{session.kernel_url}/api/kernels"
                response = requests.post(
                    kernel_create_url,
                    headers=auth_headers,
                    json={'name': 'python3'}
                )
                response.raise_for_status()
                session.kernel_id = response.json()['id']
                logger.info(f"Created new kernel {session.kernel_id} for session {session_id}")
                
                # 2. Connect to the new kernel's WebSocket channel.
                ws_url = f"ws://localhost:{PROXY_PORT}/{session_id}/api/kernels/{session.kernel_id}/channels"
                
                session.ws = websocket.create_connection(
                    ws_url,
                    header=auth_headers
                )
                logger.info(f"WebSocket connected for session '{session_id}'.")
            except Exception as e:
                logger.error(f"Failed to establish WebSocket connection for session '{session_id}': {e}")
                return None

        # The message sending logic remains identical
        msg_id = str(uuid.uuid4())
        msg = {
            "header": {"msg_id": msg_id, "username": "parsec", "session": session_id, "msg_type": "execute_request", "version": "5.3"},
            "parent_header": {}, "metadata": {}, "content": {"code": code, "silent": False, "store_history": True, "user_expressions": {}, "allow_stdin": False}, "buffers": []
        }
        session.ws.send(json.dumps(msg))
        
        results = {"stdout": "", "figures": []}
        execution_complete = False
        while not execution_complete:
            response_str = session.ws.recv()
            response = json.loads(response_str)
            if response.get("parent_header", {}).get("msg_id") != msg_id: continue
            msg_type = response["header"]["msg_type"]
            if msg_type == "stream": results["stdout"] += response["content"]["text"]
            elif msg_type == "display_data":
                if "image/png" in response["content"]["data"]: results["figures"].append(response["content"]["data"]["image/png"])
            elif msg_type == "execute_reply":
                execution_complete = True
                if response["content"]["status"] == "error":
                    results["stdout"] += f"ERROR: {response['content']['ename']}\n{response['content']['evalue']}\n" + "\n".join(response['content']['traceback'])
        
        logger.info(f"Code execution finished for session '{session_id}'.")
        return results

    def get_file_from_session(self, session_id: str, remote_path: str) -> Optional[bytes]:
        session = self.get_session(session_id)
        if not session:
            return None
        try:
            bits, stat = session.container.get_archive(remote_path)
            with io.BytesIO(b"".join(bits)) as tar_stream:
                with tarfile.open(fileobj=tar_stream, mode='r') as tar:
                    member = tar.getmembers()[0]
                    file_content = tar.extractfile(member).read()
                    return file_content
        except Exception as e:
            logger.error(f"Error getting file from session '{session_id}': {e}")
            return None

    def close_session(self, session_id: str) -> bool:
        session = self.active_sessions.get(session_id)
        if session:
            logger.info(f"Closing session '{session_id}'...")
            try:
                if session.ws and session.ws.connected: session.ws.close()
                session.container.stop(timeout=5)
                logger.success(f"Container for session '{session_id}' stopped.")
            except Exception as e:
                logger.error(f"Error during session close for '{session_id}': {e}")
            finally:
                del self.active_sessions[session_id]
            return True
        return False

    def _cleanup_stale_containers(self):
        if not self.docker_client: return
        stale_containers = self.docker_client.containers.list(all=True, filters={"name": "parsec-jupyter-*"})
        if stale_containers:
            logger.warning(f"Found {len(stale_containers)} stale session containers. Cleaning up...")
            for container in stale_containers:
                try:
                    container.remove(force=True)
                    logger.info(f"Removed stale container: {container.name}")
                except APIError as e:
                    logger.error(f"Error removing stale container {container.name}: {e}")

    def _wait_for_container_log(self, container: Container, log_pattern: str, timeout: int = 20):
        logger.info(f"Waiting for container '{container.name}' to be ready...")
        start_time = time.time()
        while time.time() - start_time < timeout:
            logs = container.logs().decode('utf-8')
            if re.search(log_pattern, logs):
                logger.success(f"Container '{container.name}' is ready.")
                return
            time.sleep(0.5)
        logs = container.logs().decode('utf-8')
        raise RuntimeError(f"Container '{container.name}' did not become ready in time. Logs: {logs}")

session_manager = SessionManager()
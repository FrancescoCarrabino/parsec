# backend/app/api/v1/dependencies.py
from ...services.workspace_service import WorkspaceService
from ...services.agent_service import AgentService
from ...services.storage_service import StorageService

# --- SINGLETON INSTANCES ---
# Create a single instance of each service for the entire application lifecycle.
_workspace_service = WorkspaceService()
_storage_service = StorageService()

# The AgentService depends on the WorkspaceService instance.
_agent_service = AgentService(workspace_service=_workspace_service)


# --- DEPENDENCY PROVIDER FUNCTIONS ---
# These functions will be used by FastAPI's `Depends()` in the API routers.

def get_workspace_service() -> WorkspaceService:
    """Returns the singleton instance of WorkspaceService."""
    return _workspace_service

def get_storage_service() -> StorageService:
    """Returns the singleton instance of StorageService."""
    return _storage_service

def get_agent_service() -> AgentService:
    """Returns the singleton instance of AgentService."""
    return _agent_service
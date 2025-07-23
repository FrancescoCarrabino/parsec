# backend/app/api/v1/assets.py
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from typing import List
from loguru import logger

from .websocket import manager, ConnectionManager
from ...services.workspace_service import WorkspaceService
from ...services.storage_service import StorageService
from ...models.elements import Asset

from .dependencies import get_workspace_service, get_storage_service

router = APIRouter()


def get_asset_type_from_file(file: UploadFile) -> str:
    """
    Determines the asset type by checking both MIME type and file extension
    for greater reliability.
    """
    mime = file.content_type
    filename = file.filename or ""
    extension = filename.split(".")[-1].lower() if "." in filename else ""

    # --- Primary check: MIME Type (more reliable) ---
    if mime:
        if mime.startswith("image/"):
            return "image"
        if mime == "application/pdf":
            return "pdf"
        if mime.startswith("text/csv"):
            return "csv"
        if mime.startswith("text/markdown"):
            return "markdown"
        if mime.startswith("text/"):
            return "text"
        if "spreadsheet" in mime or "excel" in mime:
            return "spreadsheet"
        if "presentation" in mime or "powerpoint" in mime:
            return "presentation"

    # --- Fallback check: File Extension (for when MIME is generic) ---
    if extension:
        if extension in ["jpg", "jpeg", "png", "gif", "webp", "svg"]:
            return "image"
        if extension == "pdf":
            return "pdf"
        if extension == "csv":
            return "csv"
        if extension == "md":
            return "markdown"
        if extension == "txt":
            return "text"
        if extension in ["xls", "xlsx"]:
            return "spreadsheet"
        if extension in ["ppt", "pptx"]:
            return "presentation"

    # If all checks fail, default to 'other'
    return "other"


@router.post("/", response_model=Asset, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile = File(...),
    workspace: WorkspaceService = Depends(get_workspace_service),
    storage: StorageService = Depends(get_storage_service),
):
    """
    Handles uploading a file, storing it in MinIO, creating asset metadata,
    and broadcasting the update via WebSocket.
    """
    try:
        # 1. Upload file to MinIO
        file_url = storage.upload_file(file)

        # 2. Prepare metadata
        asset_type = get_asset_type_from_file(file)
        asset_data = {
            "name": file.filename,
            "asset_type": asset_type,
            "mime_type": file.content_type,
            "url": file_url,
        }

        # 3. Create metadata record in WorkspaceService
        new_asset = workspace.create_asset(asset_data)
        if not new_asset:
            raise HTTPException(
                status_code=500, detail="Failed to create asset metadata."
            )

        # 4. Broadcast update to all connected clients
        import json

        await manager.broadcast(
            json.dumps({"type": "ASSET_CREATED", "payload": new_asset.model_dump()})
        )

        return new_asset

    except Exception as e:
        logger.error(f"Asset upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Asset])
async def list_assets(workspace: WorkspaceService = Depends(get_workspace_service)):
    """Lists all assets in the current workspace."""
    return workspace.get_all_assets()


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    workspace: WorkspaceService = Depends(get_workspace_service),
    storage: StorageService = Depends(get_storage_service),
):
    """
    Deletes an asset's metadata and its corresponding file in MinIO.
    """
    # 1. Get asset metadata to find its URL
    asset_to_delete = workspace.get_asset_by_id(asset_id)
    if not asset_to_delete:
        raise HTTPException(status_code=404, detail="Asset not found.")

    # 2. Delete the actual file from storage
    success = storage.delete_file_by_url(asset_to_delete.url)
    if not success:
        # Log error but proceed to delete metadata anyway to avoid orphaned records
        logger.warning(
            f"Could not delete file from storage for asset {asset_id}, but proceeding to delete metadata."
        )

    # 3. Delete the metadata record
    workspace.delete_asset(asset_id)

    # 4. Broadcast update to all connected clients
    import json

    await manager.broadcast(
        json.dumps({"type": "ASSET_DELETED", "payload": {"id": asset_id}})
    )

    return

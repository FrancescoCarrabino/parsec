# backend/app/services/storage_service.py
from minio import Minio
from minio.error import S3Error
from fastapi import UploadFile
from loguru import logger
import uuid
from datetime import timedelta  # <--- Import timedelta
from typing import Optional, Dict
import requests
import os

from ..core.config import settings


class StorageService:
    def __init__(self):
        try:
            self.client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_USE_SECURE,
            )
            self.bucket_name = settings.MINIO_BUCKET_NAME
            self._ensure_bucket_exists()
            logger.info(
                f"StorageService connected to MinIO endpoint '{settings.MINIO_ENDPOINT}'"
            )
        except Exception as e:
            logger.critical(f"Failed to initialize MinIO client: {e}")
            self.client = None

    def _ensure_bucket_exists(self):
        if self.client:
            found = self.client.bucket_exists(self.bucket_name)
            if not found:
                self.client.make_bucket(self.bucket_name)
                logger.success(f"Bucket '{self.bucket_name}' created in MinIO.")
            else:
                logger.info(f"Bucket '{self.bucket_name}' already exists.")

    def upload_file(self, file: UploadFile) -> str:
        """
        Uploads a file and returns a publicly accessible, presigned URL.
        """
        if not self.client:
            raise ConnectionError("MinIO client is not initialized.")

        try:
            file_extension = file.filename.split(".")[-1]
            object_name = f"{uuid.uuid4().hex}.{file_extension}"

            # 1. Upload the file as before
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=file.file,
                length=-1,
                part_size=10 * 1024 * 1024,
                content_type=file.content_type,
            )

            # --- MODIFICATION START: Use the presigned URL function ---

            # 2. Generate a presigned URL. Default expiration is 7 days.
            # This URL will be based on the INTERNAL endpoint (e.g., http://minio:9000/...)
            internal_presigned_url = self.client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=timedelta(days=7),  # The URL is valid for 7 days
            )

            # 3. Replace the internal hostname with the public-facing one for the browser.
            # This is the crucial step to bridge the Docker network and the host browser.
            internal_base_url = f"http://{settings.MINIO_ENDPOINT}"
            if settings.MINIO_USE_SECURE:
                internal_base_url = f"https://{settings.MINIO_ENDPOINT}"

            public_url = internal_presigned_url.replace(
                internal_base_url, settings.MINIO_PUBLIC_ENDPOINT
            )

            # --- MODIFICATION END ---

            logger.info(
                f"Successfully uploaded '{file.filename}'. Public URL: {public_url}"
            )
            return public_url
        except S3Error as exc:
            logger.error(f"Error uploading file to MinIO: {exc}")
            raise

    def delete_file_by_url(self, url: str) -> bool:
        if not self.client:
            raise ConnectionError("MinIO client is not initialized.")

        try:
            # We need to extract the object name from the URL, ignoring the presigned query params
            # Example: http://host/bucket/object_name?X-Amz-Algorithm=...
            path_part = url.split("?")[0]
            object_name = path_part.split("/")[-1]

            self.client.remove_object(self.bucket_name, object_name)
            logger.info(f"Successfully deleted object '{object_name}' from MinIO.")
            return True
        except S3Error as exc:
            logger.error(f"Error deleting file from MinIO: {exc}")
            return False

    def download_file_by_url(self, url: str) -> Optional[bytes]:
        """
        Downloads a file's content as bytes from its public or presigned URL.
        """
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
            logger.info(f"Successfully downloaded file from {url[:50]}...")
            return response.content
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download file from URL {url}: {e}")
            return None
            
    def upload_file_from_path(self, file_path: str, mime_type: str, object_name: str) -> Dict[str, str]:
        """
        Uploads a file from a local path to the object storage.

        Returns:
            A dictionary containing the final name and public URL of the uploaded file.
        """
        try:
            # Your existing logic to upload the file to MinIO or S3
            self.client.fput_object(
                self.bucket_name, object_name, file_path, content_type=mime_type
            )
            logger.info(f"Successfully uploaded '{file_path}' as '{object_name}'.")

            # The only responsibility of this function is to return upload details
            file_url = f"{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET_NAME}/{object_name}"
            
            return {
                "name": object_name,
                "url": file_url
            }
        except Exception as e:
            logger.exception(f"Failed to upload file '{file_path}': {e}")
            raise # Re-raise the exception to be handled by the agent


storage_service = StorageService()

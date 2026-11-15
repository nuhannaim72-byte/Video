"""Deliverable artefacts: Azure Blob Storage in production, the local filesystem otherwise."""

from __future__ import annotations

import logging
from pathlib import Path

from .config import Settings

log = logging.getLogger(__name__)


class ArtifactStorage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.container = settings.azure_storage_container
        self._client = None
        if settings.azure_storage_connection_string or settings.azure_storage_account_url:
            from azure.storage.blob.aio import BlobServiceClient

            if settings.azure_storage_connection_string:
                self._client = BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)
            else:
                from azure.identity.aio import DefaultAzureCredential

                self._client = BlobServiceClient(settings.azure_storage_account_url, credential=DefaultAzureCredential())
        self.local_dir: Path = settings.local_artifact_dir

    @property
    def backend(self) -> str:
        return "azure-blob" if self._client else "local"

    async def init(self) -> None:
        if self._client:
            container = self._client.get_container_client(self.container)
            try:
                await container.create_container()
            except Exception as exc:  # already exists, or no permission to create (pre-provisioned)
                log.debug("container not created: %s", exc)
        else:
            self.local_dir.mkdir(parents=True, exist_ok=True)

    async def put_text(self, name: str, content: str) -> str:
        """Store a UTF-8 artefact and return an internal reference (served via the API, never public)."""
        if self._client:
            blob = self._client.get_blob_client(self.container, name)
            await blob.upload_blob(content.encode("utf-8"), overwrite=True, content_type="text/markdown; charset=utf-8")
            return f"blob://{self.container}/{name}"
        path = self.local_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return f"file://{name}"

    async def get_text(self, ref: str) -> str | None:
        if ref.startswith("blob://") and self._client:
            _, _, rest = ref.partition("blob://")
            container, _, name = rest.partition("/")
            data = await (await self._client.get_blob_client(container, name).download_blob()).readall()
            return data.decode("utf-8")
        if ref.startswith("file://"):
            path = (self.local_dir / ref.removeprefix("file://")).resolve()
            if self.local_dir.resolve() in path.parents and path.exists():
                return path.read_text(encoding="utf-8")
        return None

    async def close(self) -> None:
        if self._client:
            await self._client.close()

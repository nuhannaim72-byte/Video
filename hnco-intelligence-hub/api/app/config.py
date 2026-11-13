"""Runtime configuration, read from environment variables (or a .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"

    # --- AI -----------------------------------------------------------------------------------
    # Without a key the orchestrator runs in simulated mode and labels everything as simulated.
    openai_api_key: str | None = None
    # Model name for every agent; leave empty to use the OpenAI Agents SDK default.
    openai_model: str | None = None
    # Seconds of deliberate pacing in simulated mode so the 3D office can show each phase.
    simulated_pace: float = 1.0

    # --- Auth ---------------------------------------------------------------------------------
    # "entra": validate Microsoft Entra ID access tokens. "dev": no sign-in, local development only.
    auth_mode: Literal["entra", "dev"] = "dev"
    entra_tenant_id: str | None = None
    # Accepted token audiences, e.g. "api://<api-client-id>" and the API's client id.
    entra_audiences: list[str] = Field(default_factory=list)

    # --- Data ---------------------------------------------------------------------------------
    # postgresql+asyncpg://user:pass@host:5432/db — without it, state is kept in memory.
    database_url: str | None = None
    embedding_model: str = "text-embedding-3-small"

    # --- Storage ------------------------------------------------------------------------------
    azure_storage_connection_string: str | None = None
    azure_storage_account_url: str | None = None  # use with managed identity
    azure_storage_container: str = "hnco-artifacts"
    local_artifact_dir: Path = ROOT / "api" / "data" / "artifacts"

    # --- Office behaviour ---------------------------------------------------------------------
    # Idle agents move between desk, café and standing tables. Purely visual: status stays "idle".
    ambient_presence: bool = True

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    catalog_path: Path = ROOT / "shared" / "catalog.json"

    @model_validator(mode="after")
    def _guard_production(self) -> Settings:
        if self.environment == "production" and self.auth_mode == "dev":
            raise ValueError("AUTH_MODE=dev is not allowed when ENVIRONMENT=production")
        if self.auth_mode == "entra" and (not self.entra_tenant_id or not self.entra_audiences):
            raise ValueError("AUTH_MODE=entra requires ENTRA_TENANT_ID and ENTRA_AUDIENCES")
        return self

    @property
    def live_ai(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Application configuration loaded from environment."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings from env with validation."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="Five9 AI Skill Engine", description="Application name")
    debug: bool = Field(default=False, description="Enable debug mode")
    log_level: str = Field(default="INFO", description="Structured log level")

    # Execution
    execution_mode: Literal["real", "mocked"] = Field(
        default="mocked",
        description="real = call external APIs; mocked = dry-run",
    )

    # Five9 / external
    five9_soap_base_url: str = Field(
        default="https://api.five9.com/wsadmin/v11_5/AdminWebService",
        description="SOAP Admin Web Service base URL (placeholders like {{ws_version}} resolved at runtime)",
    )
    five9_rest_base_url: str = Field(
        default="https://api.five9.com",
        description="REST API base URL",
    )
    five9_web2campaign_base_url: str = Field(
        default="https://api.five9.com/web2campaign",
        description="Web2Campaign ingest base URL",
    )
    five9_soap_username: str | None = Field(
        default=None,
        description="Five9 admin SOAP user (Basic auth) for DNC and Admin Web Service",
    )
    five9_soap_password: str | None = Field(
        default=None,
        description="Five9 admin SOAP password",
    )
    dnc_queue_db_path: str = Field(
        default="data/dnc_queue.db",
        description="SQLite path for after-hours DNC add jobs (relative to CWD)",
    )
    dnc_soap_chunk_size: int = Field(
        default=500,
        ge=1,
        le=5000,
        description="Numbers per addNumbersToDnc / removeNumbersFromDnc SOAP call",
    )
    dnc_api_key: str | None = Field(
        default=None,
        description="If set, /dnc/* requires header X-DNC-API-Key (recommended in production)",
    )

    # Skills (paths relative to backend project root)
    skills_dir: str = Field(default="app/skills", description="Relative path to skill JSON folder")
    registry_path: str = Field(default="app/registry/skills.registry.json", description="Path to generated registry")
    prompts_dir: str = Field(default="app/prompts", description="Path to prompt templates")

    # LLM / routing (pluggable)
    llm_router_url: str | None = Field(default=None, description="Optional LLM classifier service URL")
    routing_confidence_threshold: float = Field(default=0.7, ge=0, le=1, description="Min confidence to select skill")


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()

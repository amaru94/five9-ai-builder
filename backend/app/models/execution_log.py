"""Pydantic model for action execution log entry."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ExecutionLog(BaseModel):
    """Single action execution log (request/response metadata, outcome)."""

    log_id: str = Field(..., description="Unique log entry id")
    run_id: str = Field(..., description="Parent run id")
    action_id: str = Field(..., description="Action id from skill")
    skill_id: str = Field(..., description="Skill id")
    transport: str = Field(..., description="REST | SOAP | WEB2CAMPAIGN | INTERNAL")
    status: str = Field(..., description="success | failed | skipped")
    request_metadata: dict[str, Any] = Field(default_factory=dict, description="Sanitized request info for logging")
    response_metadata: dict[str, Any] = Field(default_factory=dict, description="Response summary (no full bodies)")
    error_message: str | None = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    duration_ms: float | None = None

"""Pydantic models for skill run and execution tracking."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    """Status of a skill or workflow run."""

    PENDING = "pending"
    PLANNED = "planned"
    CONFIRMATION_REQUIRED = "confirmation_required"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIAL = "partial"


class SkillRun(BaseModel):
    """A single run of one or more skills (workflow)."""

    run_id: str = Field(..., description="Unique run identifier")
    session_id: str = Field(..., description="Session this run belongs to")
    skill_ids: list[str] = Field(default_factory=list, description="Skills in this run (order preserved)")
    workflow_id: str | None = Field(default=None, description="Optional workflow id if from workflow/execute")
    status: RunStatus = Field(default=RunStatus.PENDING)
    plan: list[dict[str, Any]] = Field(default_factory=list, description="Execution plan steps")
    inputs_snapshot: dict[str, Any] = Field(default_factory=dict, description="Resolved inputs at plan time")
    confirmation_payload: dict[str, Any] | None = Field(default=None, description="Pending confirmation data")
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    execution_log_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

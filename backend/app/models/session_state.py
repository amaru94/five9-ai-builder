"""Pydantic model for session and customer state."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SessionState(BaseModel):
    """Stored state for a conversation/session (customer context, inputs, confirmations)."""

    session_id: str = Field(..., description="Unique session identifier")
    customer_context: dict[str, Any] = Field(default_factory=dict, description="Collected context, e.g. dialing_mode, agent_count")
    inputs: dict[str, Any] = Field(default_factory=dict, description="Resolved inputs for skills")
    confirm_on_new_session_fields: list[str] = Field(
        default_factory=list,
        description="Keys that should be reconfirmed when session resumes",
    )
    last_confirmed_state: dict[str, Any] | None = Field(default=None, description="Last state user confirmed")
    run_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

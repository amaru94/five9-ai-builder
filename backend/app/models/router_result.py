"""Pydantic model for routing/classification result."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RouterResult(BaseModel):
    """Result of POST /router/classify: selected skills and metadata."""

    model_config = ConfigDict(json_schema_extra={"example": {"skill_ids": ["dialer_optimization"], "confidence": 0.85, "source": "llm"}})

    skill_ids: list[str] = Field(default_factory=list, description="Selected skill id(s), may be multiple")
    confidence: float = Field(default=0.0, ge=0, le=1, description="Overall routing confidence")
    source: str = Field(default="rule", description="llm | rule | hybrid")
    clarification_questions: list[str] = Field(default_factory=list, description="When confidence low, questions to ask")
    details: dict[str, Any] = Field(default_factory=dict, description="Raw routing details for logging")

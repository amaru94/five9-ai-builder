"""Pydantic model for workflow definition (chained skills)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkflowStep(BaseModel):
    """Single step in a workflow (typically a skill id + optional overrides)."""

    skill_id: str = Field(..., description="Skill to run in this step")
    overrides: dict[str, Any] = Field(default_factory=dict, description="Input overrides for this step")
    when: str | None = Field(default=None, description="Condition to include this step")


class WorkflowDefinition(BaseModel):
    """Workflow: ordered list of skills with optional shared inputs and conditions."""

    model_config = ConfigDict(json_schema_extra={"example": {"id": "opt_flow", "name": "Optimization", "steps": [{"skill_id": "dialer_optimization"}], "confirmation_required": True}})

    id: str = Field(..., description="Unique workflow id")
    name: str = Field(..., description="Display name")
    description: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)
    shared_inputs: list[str] = Field(default_factory=list, description="Input keys shared across steps")
    confirmation_required: bool = Field(default=True)

"""Expose JSON Schema for all Pydantic models."""

from typing import Any

from fastapi import APIRouter, HTTPException

from app.models.api_action import ApiAction
from app.models.execution_log import ExecutionLog
from app.models.router_result import RouterResult
from app.models.session_state import SessionState
from app.models.skill_definition import SkillDefinition
from app.models.skill_run import SkillRun
from app.models.workflow_definition import WorkflowDefinition

router = APIRouter(prefix="/schemas", tags=["schemas"])

_MODELS: list[tuple[str, type]] = [
    ("SkillDefinition", SkillDefinition),
    ("ApiAction", ApiAction),
    ("SkillRun", SkillRun),
    ("WorkflowDefinition", WorkflowDefinition),
    ("SessionState", SessionState),
    ("RouterResult", RouterResult),
    ("ExecutionLog", ExecutionLog),
]


@router.get("", response_model=dict[str, Any])
def list_schema_names() -> dict[str, Any]:
    """List available model schema names."""
    return {"schemas": [name for name, _ in _MODELS]}


@router.get("/{model_name}", response_model=dict[str, Any])
def get_schema(model_name: str) -> dict[str, Any]:
    """Return JSON Schema for a given model (e.g. SkillDefinition, ApiAction)."""
    for name, model in _MODELS:
        if name == model_name:
            return model.model_json_schema()
    raise HTTPException(status_code=404, detail=f"Unknown model. Available: {[n for n, _ in _MODELS]}")

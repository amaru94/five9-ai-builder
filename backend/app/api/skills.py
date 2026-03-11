"""Skills API: list, get, plan, execute."""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.exceptions import MissingInputError
from app.models.skill_definition import SkillDefinition
from app.models.skill_run import SkillRun
from app.services.skill_registry import get_registry
from app.services.input_collection_service import InputCollectionService
from app.services.workflow_planner import WorkflowPlanner
from app.services.confirmation_service import ConfirmationService
from app.services.execution_service import ExecutionService
from app.services.session_state_service import SessionStateService

router = APIRouter(prefix="/skills", tags=["skills"])

_planner: WorkflowPlanner | None = None
_confirmation: ConfirmationService | None = None
_execution: ExecutionService | None = None
_sessions: SessionStateService | None = None
_input_svc: InputCollectionService | None = None


def _get_planner() -> WorkflowPlanner:
    global _planner
    if _planner is None:
        _planner = WorkflowPlanner()
    return _planner


def _get_confirmation() -> ConfirmationService:
    global _confirmation
    if _confirmation is None:
        _confirmation = ConfirmationService()
    return _confirmation


def _get_execution() -> ExecutionService:
    global _execution
    if _execution is None:
        _execution = ExecutionService()
    return _execution


def _get_sessions() -> SessionStateService:
    global _sessions
    if _sessions is None:
        _sessions = SessionStateService()
    return _sessions


def _get_input_svc() -> InputCollectionService:
    global _input_svc
    if _input_svc is None:
        _input_svc = InputCollectionService()
    return _input_svc


@router.get("", response_model=list[dict[str, Any]])
def list_skills() -> list[dict[str, Any]]:
    """List all registered skills (id, name, description)."""
    registry = get_registry()
    return [
        {"id": s.id, "name": s.name, "description": s.description, "purpose": s.purpose}
        for s in registry.list_skills()
    ]


@router.get("/{skill_id}", response_model=dict[str, Any])
def get_skill(skill_id: str) -> dict[str, Any]:
    """Get full skill definition (JSON schema compatible)."""
    registry = get_registry()
    skill = registry.get(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    return skill.model_dump(mode="json")


@router.post("/plan", response_model=dict[str, Any])
def plan_skills(body: dict[str, Any]) -> dict[str, Any]:
    """
    Build execution plan for given skill_ids and inputs.
    Body: { "skill_ids": list[str], "session_id": str?, "inputs": dict }.
    Returns plan, run_id, missing inputs if any, confirmation_required.
    """
    skill_ids = body.get("skill_ids") or []
    session_id = body.get("session_id") or str(uuid.uuid4())
    inputs = body.get("inputs") or {}
    if not skill_ids:
        raise HTTPException(status_code=400, detail="skill_ids required")

    registry = get_registry()
    planner = _get_planner()
    confirmation = _get_confirmation()
    input_svc = _get_input_svc()
    exec_svc = _get_execution()

    # Merge session inputs if present
    sessions = _get_sessions()
    state = sessions.get(session_id)
    if state:
        merged = dict(state.inputs)
        merged.update(inputs)
        inputs = merged

    # Check required inputs for all skills
    missing_all: list[str] = []
    for sid in skill_ids:
        skill = registry.get(sid)
        if skill:
            missing = input_svc.get_missing_required(skill, inputs)
            missing_all.extend(missing)
    missing_all = list(dict.fromkeys(missing_all))

    plan = planner.plan_skills(skill_ids, inputs)
    run_id = str(uuid.uuid4())
    first_skill = registry.get(skill_ids[0]) if skill_ids else None
    confirmation_required = confirmation.workflow_confirmation_required(first_skill)

    # Store run as PLANNED so GET /runs/{run_id} can return it
    from app.models.skill_run import RunStatus
    run = SkillRun(
        run_id=run_id,
        session_id=session_id,
        skill_ids=skill_ids,
        status=RunStatus.PLANNED,
        plan=plan,
        inputs_snapshot=inputs,
    )
    exec_svc.store_run(run)

    return {
        "run_id": run_id,
        "session_id": session_id,
        "plan": plan,
        "inputs_snapshot": inputs,
        "missing_inputs": missing_all,
        "confirmation_required": confirmation_required,
    }


@router.post("/execute", response_model=dict[str, Any])
def execute_skills(body: dict[str, Any]) -> dict[str, Any]:
    """
    Execute a planned run. Body: { "run_id": str, "session_id": str?, "confirmed": bool?, "dry_run": bool?, "inputs": dict? }.
    If dry_run is true, no external APIs are called; response includes rendered_request_payloads only.
    """
    run_id = body.get("run_id")
    session_id = body.get("session_id") or ""
    confirmed = body.get("confirmed", True)
    dry_run = body.get("dry_run", False)
    inputs_override = body.get("inputs") or {}

    if not run_id:
        raise HTTPException(status_code=400, detail="run_id required")

    exec_svc = _get_execution()
    run = exec_svc.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    inputs = dict(run.inputs_snapshot)
    inputs.update(inputs_override)
    plan = run.plan

    exec_svc.execute_plan(
        run_id=run_id,
        session_id=session_id or run.session_id,
        plan=plan,
        inputs_snapshot=inputs,
        confirmed=confirmed,
        dry_run=dry_run,
    )
    updated = exec_svc.get_run(run_id)
    out = {
        "run_id": run_id,
        "status": updated.status.value,
        "error_message": updated.error_message,
        "execution_log_ids": updated.execution_log_ids,
    }
    if dry_run and getattr(updated, "rendered_request_payloads", None):
        out["rendered_request_payloads"] = updated.rendered_request_payloads
    return out

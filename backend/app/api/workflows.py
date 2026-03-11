"""Workflows API: plan and execute workflow by definition."""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app.models.workflow_definition import WorkflowDefinition
from app.services.skill_registry import get_registry
from app.services.workflow_planner import WorkflowPlanner
from app.services.confirmation_service import ConfirmationService
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/workflows", tags=["workflows"])

_planner: WorkflowPlanner | None = None
_confirmation: ConfirmationService | None = None
_execution: ExecutionService | None = None


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


@router.post("/plan", response_model=dict[str, Any])
def plan_workflow(body: dict[str, Any]) -> dict[str, Any]:
    """
    Build execution plan from workflow definition.
    Body: { "workflow": WorkflowDefinition (id, name, steps, shared_inputs, confirmation_required), "inputs": dict }.
    """
    workflow_data = body.get("workflow")
    inputs = body.get("inputs") or {}
    if not workflow_data:
        raise HTTPException(status_code=400, detail="workflow required")

    workflow = WorkflowDefinition.model_validate(workflow_data)
    planner = _get_planner()
    plan = planner.plan_workflow(workflow, inputs)
    run_id = str(uuid.uuid4())
    session_id = body.get("session_id") or str(uuid.uuid4())

    from app.models.skill_run import SkillRun, RunStatus
    exec_svc = _get_execution()
    run = SkillRun(
        run_id=run_id,
        session_id=session_id,
        skill_ids=[s["skill_id"] for s in plan],
        workflow_id=workflow.id,
        status=RunStatus.PLANNED,
        plan=plan,
        inputs_snapshot=inputs,
    )
    exec_svc.store_run(run)

    return {
        "run_id": run_id,
        "session_id": session_id,
        "workflow_id": workflow.id,
        "plan": plan,
        "inputs_snapshot": inputs,
        "confirmation_required": workflow.confirmation_required,
    }


@router.post("/execute", response_model=dict[str, Any])
def execute_workflow(body: dict[str, Any]) -> dict[str, Any]:
    """
    Execute a planned workflow run. Body: { "run_id": str, "confirmed": bool?, "dry_run": bool?, "inputs": dict? }.
    If dry_run is true, no external APIs are called; response includes rendered_request_payloads only.
    """
    run_id = body.get("run_id")
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

    exec_svc.execute_plan(
        run_id=run_id,
        session_id=run.session_id,
        plan=run.plan,
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

"""Runs API: get run by id."""

from fastapi import APIRouter, HTTPException

from app.services.execution_service import ExecutionService
from app.services.summary_service import SummaryService

router = APIRouter(prefix="/runs", tags=["runs"])

_execution: ExecutionService | None = None
_summary: SummaryService | None = None


def _get_execution() -> ExecutionService:
    global _execution
    if _execution is None:
        _execution = ExecutionService()
    return _execution


def _get_summary() -> SummaryService:
    global _summary
    if _summary is None:
        _summary = SummaryService(_get_execution())
    return _summary


@router.get("/{run_id}", response_model=dict)
def get_run(run_id: str) -> dict:
    """Get run status, plan, inputs_snapshot, execution_log_ids, error_message."""
    exec_svc = _get_execution()
    run = exec_svc.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    summary_svc = _get_summary()
    out = summary_svc.run_summary(run)
    # Include full run fields for API contract
    out["plan"] = run.plan
    out["inputs_snapshot"] = run.inputs_snapshot
    out["confirmation_payload"] = run.confirmation_payload
    out["execution_log_ids"] = run.execution_log_ids
    if getattr(run, "rendered_request_payloads", None):
        out["rendered_request_payloads"] = run.rendered_request_payloads
    return out

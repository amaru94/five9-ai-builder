"""Generate execution summaries and artifact descriptions."""

from typing import Any

from app.core.logging import get_logger
from app.models.skill_run import SkillRun
from app.services.execution_service import ExecutionService

logger = get_logger(__name__)


class SummaryService:
    """Builds human-readable summaries of runs and outputs."""

    def __init__(self, execution_service: ExecutionService | None = None) -> None:
        self._exec = execution_service

    def run_summary(self, run: SkillRun) -> dict[str, Any]:
        """Return summary dict for a run: status, skill_ids, error if any, duration."""
        duration_sec = None
        if run.started_at and run.completed_at:
            duration_sec = (run.completed_at - run.started_at).total_seconds()
        return {
            "run_id": run.run_id,
            "session_id": run.session_id,
            "skill_ids": run.skill_ids,
            "workflow_id": run.workflow_id,
            "status": run.status.value,
            "error_message": run.error_message,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "duration_seconds": duration_sec,
            "execution_log_count": len(run.execution_log_ids),
        }

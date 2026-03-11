"""Orchestrates sequential execution of plan steps via transport executors."""

import uuid
from datetime import datetime
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.api_action import ActionTransport, ApiAction
from app.models.execution_log import ExecutionLog
from app.models.skill_run import RunStatus, SkillRun
from app.services.skill_registry import get_registry
from app.executors.rest_executor import RestExecutor
from app.executors.soap_executor import SoapExecutor
from app.executors.web2campaign_executor import Web2CampaignExecutor
from app.executors.internal_executor import InternalExecutor

logger = get_logger(__name__)


class ExecutionService:
    """Runs a plan sequentially; delegates to REST/SOAP/Web2Campaign/Internal executors."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._rest = RestExecutor()
        self._soap = SoapExecutor()
        self._web2 = Web2CampaignExecutor()
        self._internal = InternalExecutor()
        self._runs: dict[str, SkillRun] = {}
        self._logs: dict[str, ExecutionLog] = {}

    def get_run(self, run_id: str) -> SkillRun | None:
        """Return run by id."""
        return self._runs.get(run_id)

    def store_run(self, run: SkillRun) -> None:
        """Store a run (e.g. after planning) for later execution or GET /runs/{id}."""
        self._runs[run.run_id] = run

    def execute_plan(
        self,
        run_id: str,
        session_id: str,
        plan: list[dict[str, Any]],
        inputs_snapshot: dict[str, Any],
        confirmed: bool = True,
        dry_run: bool = False,
    ) -> SkillRun:
        """
        Execute plan sequentially. If confirmed is False, set status to CONFIRMATION_REQUIRED and return.
        If dry_run is True, do not call external APIs; only return run with rendered_request_payloads.
        """
        run = self._runs.get(run_id)
        if not run:
            run = SkillRun(
                run_id=run_id,
                session_id=session_id,
                skill_ids=[s["skill_id"] for s in plan],
                status=RunStatus.PLANNED,
                plan=plan,
                inputs_snapshot=inputs_snapshot,
            )
            self._runs[run_id] = run

        if not confirmed:
            run.status = RunStatus.CONFIRMATION_REQUIRED
            run.confirmation_payload = {"plan": plan, "inputs": inputs_snapshot}
            logger.info("confirmation_required", extra={"run_id": run_id})
            return run

        if dry_run:
            rendered = self._render_plan(plan, inputs_snapshot)
            run.status = RunStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            setattr(run, "rendered_request_payloads", rendered)
            logger.info("workflow_dry_run", extra={"run_id": run_id, "payload_count": len(rendered)})
            return run

        run.status = RunStatus.RUNNING
        run.started_at = datetime.utcnow()
        registry = get_registry()
        is_mocked = self.settings.execution_mode == "mocked"
        ctx = dict(inputs_snapshot)

        try:
            for step in plan:
                skill_id = step.get("skill_id")
                action_ids = step.get("actions", [])
                overrides = step.get("overrides", {})
                ctx.update(overrides)
                skill = registry.get(skill_id) if skill_id else None
                if not skill:
                    continue
                for action_id in action_ids:
                    action = next((a for a in skill.actions if a.id == action_id), None)
                    if not action:
                        continue
                    log_entry = self._execute_action(
                        run_id=run_id,
                        skill_id=skill_id,
                        action=action,
                        context=ctx,
                        mocked=is_mocked,
                    )
                    if log_entry:
                        run.execution_log_ids.append(log_entry.log_id)
                        if log_entry.error_message:
                            run.status = RunStatus.FAILED
                            run.error_message = log_entry.error_message
                            run.completed_at = datetime.utcnow()
                            return run
            run.status = RunStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            logger.info(
                "workflow_completion",
                extra={"run_id": run_id, "status": "completed"},
            )
        except Exception as e:
            run.status = RunStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            logger.exception(
                "workflow_failure",
                extra={"run_id": run_id, "error": str(e)},
            )

        return run

    def _render_plan(self, plan: list[dict[str, Any]], inputs_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        """Render all actions in plan without calling external APIs. Used for dry_run."""
        registry = get_registry()
        ctx = dict(inputs_snapshot)
        out: list[dict[str, Any]] = []
        for step in plan:
            skill_id = step.get("skill_id", "")
            action_ids = step.get("actions", [])
            overrides = step.get("overrides", {})
            ctx = {**ctx, **overrides}
            skill = registry.get(skill_id) if skill_id else None
            if not skill:
                continue
            for action_id in action_ids:
                action = next((a for a in skill.actions if a.id == action_id), None)
                if not action:
                    continue
                payload = self._render_action(skill_id, action, ctx)
                if payload:
                    out.append(payload)
        return out

    def _render_action(self, skill_id: str, action: ApiAction, context: dict[str, Any]) -> dict[str, Any] | None:
        """Return rendered request for one action (no HTTP)."""
        try:
            if action.transport == ActionTransport.REST:
                p = self._rest.render_request(action, context)
            elif action.transport == ActionTransport.SOAP:
                p = self._soap.render_request(action, context)
            elif action.transport == ActionTransport.WEB2CAMPAIGN:
                p = self._web2.render_request(action, context)
            elif action.transport == ActionTransport.INTERNAL:
                p = self._internal.render_request(action, context)
            else:
                return None
            p["skill_id"] = skill_id
            return p
        except Exception:
            return None

    def _execute_action(
        self,
        run_id: str,
        skill_id: str,
        action: ApiAction,
        context: dict[str, Any],
        mocked: bool,
    ) -> ExecutionLog | None:
        """Dispatch to correct executor and record ExecutionLog."""
        log_id = str(uuid.uuid4())
        start = datetime.utcnow()
        request_meta: dict[str, Any] = {}
        response_meta: dict[str, Any] = {}
        error_msg: str | None = None

        try:
            if action.transport == ActionTransport.REST:
                req, resp = self._rest.execute(action, context, mocked=mocked)
                request_meta = getattr(req, "metadata", {}) or {"method": action.method, "path": action.path}
                response_meta = getattr(resp, "metadata", {}) or {"status_code": getattr(resp, "status_code", None)}
            elif action.transport == ActionTransport.SOAP:
                req, resp = self._soap.execute(action, context, mocked=mocked)
                request_meta = getattr(req, "metadata", {}) or {"operation": action.soap_operation}
                response_meta = getattr(resp, "metadata", {}) or {}
            elif action.transport == ActionTransport.WEB2CAMPAIGN:
                req, resp = self._web2.execute(action, context, mocked=mocked)
                request_meta = getattr(req, "metadata", {}) or {}
                response_meta = getattr(resp, "metadata", {}) or {}
            elif action.transport == ActionTransport.INTERNAL:
                req, resp = self._internal.execute(action, context, mocked=mocked)
                request_meta = getattr(req, "metadata", {}) or {}
                response_meta = getattr(resp, "metadata", {}) or {}
            else:
                error_msg = f"Unknown transport: {action.transport}"
        except Exception as e:
            error_msg = str(e)
            logger.exception(
                "action_execution",
                extra={"run_id": run_id, "action_id": action.id, "error": error_msg},
            )

        end = datetime.utcnow()
        duration_ms = int((end - start).total_seconds() * 1000)
        log_entry = ExecutionLog(
            log_id=log_id,
            run_id=run_id,
            action_id=action.id,
            skill_id=skill_id,
            transport=action.transport.value,
            status="failed" if error_msg else "success",
            request_metadata=request_meta,
            response_metadata=response_meta,
            error_message=error_msg,
            started_at=start,
            completed_at=end,
            duration_ms=duration_ms,
        )
        self._logs[log_id] = log_entry
        logger.info(
            "action_execution",
            extra={
                "run_id": run_id,
                "action_id": action.id,
                "transport": action.transport.value,
                "status": log_entry.status,
                "request_metadata": request_meta,
                "response_metadata": response_meta,
            },
        )
        return log_entry

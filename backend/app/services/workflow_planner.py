"""Build sequential execution plans from skill ids or workflow definition."""

from typing import Any

from app.core.logging import get_logger
from app.models.skill_definition import SkillDefinition
from app.models.workflow_definition import WorkflowDefinition
from app.services.skill_registry import get_registry

logger = get_logger(__name__)


class WorkflowPlanner:
    """Produces a sequential list of (skill_id, action) steps for execution."""

    def plan_skills(
        self,
        skill_ids: list[str],
        shared_inputs: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        Build execution plan from skill ids. Each step: {skill_id, actions: [action_id, ...], overrides}.
        Sequential only; one skill after another, each skill's actions in order.
        """
        registry = get_registry()
        plan: list[dict[str, Any]] = []
        for skill_id in skill_ids:
            skill = registry.get(skill_id)
            if not skill:
                logger.warning("workflow_plan_skip_unknown_skill", extra={"skill_id": skill_id})
                continue
            step = {
                "skill_id": skill_id,
                "actions": [a.id for a in skill.actions],
                "overrides": {},
            }
            plan.append(step)
        logger.info(
            "workflow_plan_created",
            extra={"skill_ids": skill_ids, "step_count": len(plan)},
        )
        return plan

    def plan_workflow(
        self,
        workflow: WorkflowDefinition,
        shared_inputs: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        Build execution plan from workflow definition. Steps may have overrides and when conditions.
        """
        registry = get_registry()
        plan: list[dict[str, Any]] = []
        for wstep in workflow.steps:
            skill = registry.get(wstep.skill_id)
            if not skill:
                logger.warning("workflow_plan_skip_unknown_skill", extra={"skill_id": wstep.skill_id})
                continue
            # TODO: evaluate wstep.when if present
            step = {
                "skill_id": wstep.skill_id,
                "actions": [a.id for a in skill.actions],
                "overrides": wstep.overrides or {},
            }
            plan.append(step)
        logger.info(
            "workflow_plan_created",
            extra={"workflow_id": workflow.id, "step_count": len(plan)},
        )
        return plan

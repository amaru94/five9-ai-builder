"""Workflow- and step-level confirmation gating."""

from typing import Any

from app.core.logging import get_logger
from app.models.api_action import ActionRiskLevel, ApiAction
from app.models.skill_definition import SkillDefinition, ExecutionSettings

logger = get_logger(__name__)


class ConfirmationService:
    """Determines when confirmation is required (workflow vs step-level)."""

    def workflow_confirmation_required(
        self,
        skill: SkillDefinition | None,
        default: bool = True,
    ) -> bool:
        """True if workflow-level confirmation should be required."""
        if skill and skill.execution_settings:
            return skill.execution_settings.workflow_confirmation_default
        return default

    def step_confirmation_required(
        self,
        action: ApiAction,
        settings: ExecutionSettings | None,
    ) -> bool:
        """True if this action requires step-level confirmation: high risk or requires_confirmation flag."""
        if not settings or not settings.adaptive_step_confirmation:
            return False
        if getattr(action, "requires_confirmation", False):
            return True
        return action.risk_level == ActionRiskLevel.HIGH

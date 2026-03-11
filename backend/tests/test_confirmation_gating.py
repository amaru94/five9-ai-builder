"""Tests for confirmation gating (workflow and step-level)."""

import pytest
from pathlib import Path

from app.services.confirmation_service import ConfirmationService
from app.services.skill_registry import SkillRegistry
from app.models.api_action import ActionRiskLevel, ApiAction, ActionTransport


def test_workflow_confirmation_required():
    """Workflow-level confirmation default true when skill has execution_settings.workflow_confirmation_default."""
    svc = ConfirmationService()
    assert svc.workflow_confirmation_required(None, default=True) is True
    assert svc.workflow_confirmation_required(None, default=False) is False


def test_step_confirmation_required_high_risk():
    """Step-level confirmation required when action is high-risk and adaptive is on."""
    from app.models.skill_definition import SkillDefinition, ExecutionSettings
    svc = ConfirmationService()
    settings = ExecutionSettings(adaptive_step_confirmation=True)
    high_action = ApiAction(id="a1", name="High", transport=ActionTransport.REST, risk_level=ActionRiskLevel.HIGH)
    assert svc.step_confirmation_required(high_action, settings) is True
    low_action = ApiAction(id="a2", name="Low", transport=ActionTransport.REST, risk_level=ActionRiskLevel.LOW)
    assert svc.step_confirmation_required(low_action, settings) is False


def test_step_confirmation_off_when_adaptive_disabled():
    """When adaptive_step_confirmation is False, step confirmation is not required."""
    from app.models.skill_definition import ExecutionSettings
    svc = ConfirmationService()
    settings = ExecutionSettings(adaptive_step_confirmation=False)
    high_action = ApiAction(id="a1", name="High", transport=ActionTransport.SOAP, risk_level=ActionRiskLevel.HIGH)
    assert svc.step_confirmation_required(high_action, settings) is False

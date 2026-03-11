"""Tests for sequential workflow planning."""

import pytest
from pathlib import Path

from app.services.workflow_planner import WorkflowPlanner
from app.services.skill_registry import SkillRegistry


@pytest.fixture
def registry():
    backend = Path(__file__).resolve().parent.parent
    r = SkillRegistry()
    r.build_from_skills_dir(base_path=backend)
    return r


def test_plan_skills_sequential(registry):
    """Plan returns sequential steps: one per skill, actions in order."""
    planner = WorkflowPlanner()
    plan = planner.plan_skills(["customer_discovery", "dialer_optimization"], {})
    assert len(plan) == 2
    assert plan[0]["skill_id"] == "customer_discovery"
    assert plan[1]["skill_id"] == "dialer_optimization"
    assert "actions" in plan[0]
    assert isinstance(plan[0]["actions"], list)


def test_plan_skills_unknown_skipped(registry):
    """Unknown skill_id is skipped (warning), not crashed."""
    planner = WorkflowPlanner()
    plan = planner.plan_skills(["customer_discovery", "nonexistent_skill", "dialer_optimization"], {})
    assert len(plan) == 2
    assert plan[0]["skill_id"] == "customer_discovery"
    assert plan[1]["skill_id"] == "dialer_optimization"

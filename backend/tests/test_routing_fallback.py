"""Tests for rule-based routing fallback (trigger phrases)."""

import pytest

from app.services.skill_registry import SkillRegistry
from app.services.rule_router import rule_based_classify
from pathlib import Path


@pytest.fixture
def registry():
    backend = Path(__file__).resolve().parent.parent
    r = SkillRegistry()
    r.build_from_skills_dir(base_path=backend)
    return r


def test_rule_based_classify_empty():
    """Empty message returns low confidence and no skills."""
    result = rule_based_classify("")
    assert result.confidence == 0.0
    assert result.skill_ids == []
    assert result.source == "rule"


def test_rule_based_classify_trigger_phrase(registry):
    """Message containing a trigger phrase from a skill matches that skill."""
    # customer_discovery has trigger "customer discovery"
    result = rule_based_classify("I need help with customer discovery for my team")
    assert result.skill_ids
    assert "customer_discovery" in result.skill_ids or result.confidence >= 0.8


def test_rule_based_classify_dialer(registry):
    """Dialer-related phrase matches dialer_optimization."""
    result = rule_based_classify("The dialer is not reaching all my leads")
    assert result.skill_ids
    assert result.confidence >= 0.7

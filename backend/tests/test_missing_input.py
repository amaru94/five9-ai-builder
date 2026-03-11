"""Tests for missing input detection."""

import pytest
from pathlib import Path

from app.models.skill_definition import SkillDefinition
from app.services.skill_registry import SkillRegistry
from app.services.input_collection_service import InputCollectionService
from app.core.exceptions import MissingInputError
from app.utils.validators import validate_required_inputs


def test_validate_required_inputs():
    """validate_required_inputs returns missing keys."""
    missing = validate_required_inputs({"a": "x"}, {"a", "b", "c"})
    assert set(missing) == {"b", "c"}
    missing_none = validate_required_inputs({"a": 1, "b": "y", "c": True}, {"a", "b", "c"})
    assert missing_none == []


def test_empty_string_considered_missing():
    """Empty string is considered missing."""
    missing = validate_required_inputs({"a": "", "b": "  "}, {"a", "b"})
    assert "a" in missing
    assert "b" in missing


def test_input_collection_service_missing():
    """InputCollectionService.get_missing_required and ensure_required."""
    backend = Path(__file__).resolve().parent.parent
    registry = SkillRegistry()
    registry.build_from_skills_dir(base_path=backend)
    skill = registry.get("dialer_optimization")
    assert skill is not None
    svc = InputCollectionService()
    missing = svc.get_missing_required(skill, {"domain_id": "d1"})
    assert "campaign_id" in missing or "agent_count" in missing
    with pytest.raises(MissingInputError) as exc:
        svc.ensure_required(skill, {"domain_id": "d1"})
    assert len(exc.value.missing) > 0
    assert exc.value.details.get("skill_id") == "dialer_optimization"

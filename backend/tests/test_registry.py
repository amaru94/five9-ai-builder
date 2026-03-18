"""Tests for registry loading from skill folder."""

import pytest
from pathlib import Path

from app.services.skill_loader import load_skill_from_file, load_skills_from_dir
from app.services.skill_registry import SkillRegistry


def test_load_skills_from_dir():
    """Registry loading: load from app/skills and get at least the seed skills."""
    backend = Path(__file__).resolve().parent.parent
    skills_dir = backend / "app" / "skills"
    skills = load_skills_from_dir(skills_dir)
    assert len(skills) >= 10
    expected_ids = {
        "customer_discovery",
        "dialer_optimization",
        "disposition_architecture",
        "dialing_mode_advisor",
        "asap_lead_strategy",
        "campaign_script_builder",
        "reporting_setup",
        "web2campaign_ingest",
        "admin_ws_skill_management",
        "domain_dnc_management",
    }
    for eid in expected_ids:
        assert eid in skills, f"Missing skill: {eid}"
    for sid, skill in skills.items():
        assert skill.id == sid
        assert skill.name
        assert skill.authoring.version


def test_registry_build_from_skills_dir():
    """Registry builds and list_skills returns all."""
    backend = Path(__file__).resolve().parent.parent
    registry = SkillRegistry()
    registry.build_from_skills_dir(base_path=backend)
    ids = registry.list_ids()
    assert len(ids) >= 9
    skill = registry.get("customer_discovery")
    assert skill is not None
    assert skill.get_required_input_keys()


def test_load_single_skill_file():
    """Load one valid skill file."""
    backend = Path(__file__).resolve().parent.parent
    path = backend / "app" / "skills" / "customer_discovery.skill.json"
    skill = load_skill_from_file(path)
    assert skill is not None
    assert skill.id == "customer_discovery"
    assert len(skill.required_inputs) >= 1

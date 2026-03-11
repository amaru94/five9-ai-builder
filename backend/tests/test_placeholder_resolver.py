"""Tests for placeholder rendering and list_placeholders."""

import pytest

from app.utils.placeholder_resolver import resolve_placeholders, list_placeholders


def test_resolve_string():
    """Placeholder rendering: resolve {{key}} in string."""
    out = resolve_placeholders("hello {{name}}", {"name": "world"})
    assert out == "hello world"


def test_resolve_missing_left_unchanged():
    """Missing key leaves {{key}} unchanged."""
    out = resolve_placeholders("{{domain_id}}", {"other": "x"})
    assert out == "{{domain_id}}"


def test_resolve_nested_dict():
    """Resolve in nested dict and list."""
    t = {"path": "/domains/{{domain_id}}/campaigns/{{campaign_id}}", "nested": [{"a": "{{x}}"}]}
    out = resolve_placeholders(t, {"domain_id": "d1", "campaign_id": "c1", "x": "val"})
    assert out["path"] == "/domains/d1/campaigns/c1"
    assert out["nested"][0]["a"] == "val"


def test_list_placeholders():
    """list_placeholders returns set of keys used."""
    keys = list_placeholders("{{domain_id}} and {{campaign_id}}")
    assert keys == {"domain_id", "campaign_id"}
    keys2 = list_placeholders({"u": "{{F9domain}}", "p": "{{F9list}}"})
    assert keys2 == {"F9domain", "F9list"}

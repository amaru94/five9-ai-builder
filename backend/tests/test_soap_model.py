"""Tests for SOAP request model generation (render_soap_body, ApiAction)."""

import pytest

from app.utils.xml_helpers import render_soap_body
from app.models.api_action import ApiAction, ActionTransport


def test_render_soap_body_dict():
    """SOAP body from dict template produces envelope with operation and body."""
    ctx = {"skill_name_pattern": ".*"}
    template = {
        "operation": "getSkills",
        "body": "<skillNamePattern>{{skill_name_pattern}}</skillNamePattern>",
        "namespace": "http://service.admin.ws.five9.com/v11_5/",
    }
    envelope = render_soap_body(template, ctx)
    assert "getSkills" in envelope
    assert "skillNamePattern" in envelope
    assert ".*" in envelope
    assert "Envelope" in envelope
    assert "Body" in envelope


def test_render_soap_body_string():
    """String template is resolved with placeholders."""
    envelope = render_soap_body("<x>{{val}}</x>", {"val": "hello"})
    assert "hello" in envelope


def test_soap_action_model():
    """ApiAction with transport SOAP has soap_operation and soap_body_template."""
    action = ApiAction(
        id="get_skills",
        name="Get skills",
        transport=ActionTransport.SOAP,
        soap_operation="getSkills",
        soap_version="v11_5",
        soap_body_template={"operation": "getSkills", "body": "<skillNamePattern>{{x}}</skillNamePattern>"},
    )
    assert action.transport == ActionTransport.SOAP
    assert action.soap_operation == "getSkills"
    assert "body" in (action.soap_body_template or {})

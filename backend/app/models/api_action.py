"""Pydantic models for skill actions (REST, SOAP, Web2Campaign, Internal)."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ActionTransport(str, Enum):
    """Supported action transport types."""

    REST = "REST"
    SOAP = "SOAP"
    WEB2CAMPAIGN = "WEB2CAMPAIGN"
    INTERNAL = "INTERNAL"


class ActionRiskLevel(str, Enum):
    """Risk level for adaptive confirmation."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ApiAction(BaseModel):
    """Single executable action within a skill or workflow step."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"example": {"id": "get_config", "name": "Get config", "transport": "REST", "method": "GET", "path": "/v1/domains/{{domain_id}}/config"}})

    id: str = Field(..., description="Unique action id within the skill")
    name: str = Field(..., description="Human-readable action name")
    transport: ActionTransport = Field(..., description="REST, SOAP, WEB2CAMPAIGN, or INTERNAL")
    risk_level: ActionRiskLevel = Field(default=ActionRiskLevel.LOW, description="Used for step-level confirmation")
    requires_confirmation: bool = Field(default=False, description="If true, require step-level confirmation before executing")
    description: str | None = Field(default=None, description="Optional description for logs/UI")

    # Transport-specific payload (templates with placeholders)
    # REST
    method: str | None = Field(default=None, description="HTTP method for REST")
    path: str | None = Field(default=None, description="URL path template for REST")
    headers: dict[str, str] | None = Field(default=None, description="Request headers template")
    body: dict[str, Any] | str | None = Field(default=None, description="Request body template")

    # SOAP
    soap_operation: str | None = Field(default=None, description="SOAP operation name, e.g. getSkills, createSkill")
    soap_body_template: str | dict[str, Any] | None = Field(default=None, description="SOAP body or envelope template")
    soap_version: str | None = Field(default="v11_5", description="WS version segment, e.g. v11_5, v2")

    # Web2Campaign
    web2campaign_method: str | None = Field(default="POST", description="GET or POST for AddToList")
    web2campaign_params: dict[str, str] | None = Field(default=None, description="Form params template (F9domain, F9list, number1, etc.)")

    # INTERNAL (artifact generation, no external call)
    internal_handler: str | None = Field(default=None, description="Handler name for INTERNAL actions")
    internal_payload: dict[str, Any] | None = Field(default=None, description="Payload for internal handler")

    # Conditional execution
    when: str | None = Field(default=None, description="Optional condition expression; if falsy, skip action")

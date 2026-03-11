"""Pydantic model for skill definition (JSON skill files)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.api_action import ApiAction


class AuthoringMetadata(BaseModel):
    """Authoring metadata for every skill."""

    version: str = Field(default="1.0.0")
    status: str = Field(default="draft", description="draft | review | published")
    owner: str | None = None
    last_updated_by: str | None = None
    reviewed_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None
    internal_comments: str | None = None


class RoutingMetadata(BaseModel):
    """Routing metadata: triggers and discovery for hybrid routing."""

    trigger_phrases: list[str] = Field(default_factory=list, description="Rule-based fallback phrases")
    keywords: list[str] = Field(default_factory=list)
    discovery_questions: list[str] = Field(default_factory=list, description="Questions when confidence is low")
    related_skills: list[str] = Field(default_factory=list)


class InputSpec(BaseModel):
    """Spec for a required or optional input."""

    key: str = Field(..., description="Input key, e.g. domain_id, campaign_id")
    label: str | None = None
    description: str | None = None
    required: bool = True
    default: Any = None
    confirm_on_new_session: bool = Field(default=False, description="If true, reconfirm when resuming session")
    validation: dict[str, Any] | None = None  # e.g. {"type": "string", "min_length": 1}


class DecisionNode(BaseModel):
    """Simple decision logic node (e.g. if lead_demographic == 'elderly' -> timeout 60)."""

    condition: str = Field(..., description="Expression or key to evaluate")
    value: Any = None
    then: str | list[str] | None = Field(default=None, description="Action id(s) or next step")
    else_: str | list[str] | None = Field(default=None, alias="else")


class ExecutionSettings(BaseModel):
    """Execution behavior for this skill."""

    workflow_confirmation_default: bool = Field(default=True, description="Require workflow-level confirm before run")
    adaptive_step_confirmation: bool = Field(default=True, description="Require step confirm for high-risk actions")
    sequential_only: bool = Field(default=True)
    allow_partial: bool = Field(default=False, description="Allow partial execution on failure")


class SkillDefinition(BaseModel):
    """Full skill definition loaded from JSON."""

    model_config = ConfigDict(extra="allow", populate_by_name=True, json_schema_extra={"example": {"id": "my_skill", "name": "My Skill", "required_inputs": [], "actions": []}})

    id: str = Field(..., description="Unique skill id, e.g. customer_discovery")
    name: str = Field(..., description="Display name")
    description: str | None = None
    purpose: str | None = Field(default=None, description="Consulting purpose statement")

    authoring: AuthoringMetadata = Field(default_factory=AuthoringMetadata)
    routing: RoutingMetadata = Field(default_factory=RoutingMetadata)

    required_inputs: list[InputSpec] = Field(default_factory=list)
    optional_inputs: list[InputSpec] = Field(default_factory=list)
    discovery_questions: list[str] = Field(default_factory=list)
    decision_logic: list[DecisionNode] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list, description="Other skill ids this skill depends on")
    actions: list[ApiAction] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list, description="Output keys this skill produces")
    execution_settings: ExecutionSettings = Field(default_factory=ExecutionSettings)

    def get_all_input_keys(self) -> set[str]:
        """Return set of all input keys (required + optional)."""
        keys = set()
        for spec in self.required_inputs + self.optional_inputs:
            keys.add(spec.key)
        return keys

    def get_required_input_keys(self) -> set[str]:
        """Return set of required input keys."""
        return {spec.key for spec in self.required_inputs if spec.required}

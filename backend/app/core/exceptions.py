"""Custom exceptions for the skill engine."""

from typing import Any


class SkillEngineError(Exception):
    """Base exception for skill engine."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        self.message = message
        self.details = details or {}
        super().__init__(message)


class SkillNotFoundError(SkillEngineError):
    """Raised when a skill ID is not in the registry."""


class ValidationError(SkillEngineError):
    """Raised when input or state validation fails."""


class MissingInputError(SkillEngineError):
    """Raised when required inputs are missing for execution."""

    def __init__(self, message: str, missing: list[str], details: dict[str, Any] | None = None) -> None:
        super().__init__(message, {**(details or {}), "missing_inputs": missing})
        self.missing = missing


class ConfirmationRequiredError(SkillEngineError):
    """Raised when workflow or step confirmation is required before execution."""

    def __init__(
        self,
        message: str,
        confirmation_type: str,
        payload: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, {**(details or {}), "confirmation_type": confirmation_type, "payload": payload or {}})
        self.confirmation_type = confirmation_type
        self.payload = payload or {}


class ExecutionError(SkillEngineError):
    """Raised when an action execution fails."""

    def __init__(self, message: str, action_id: str | None = None, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, {**(details or {}), "action_id": action_id} if action_id else details)
        self.action_id = action_id


class RoutingLowConfidenceError(SkillEngineError):
    """Raised when routing confidence is below threshold; clarification needed."""

    def __init__(self, message: str, clarification_questions: list[str], details: dict[str, Any] | None = None) -> None:
        super().__init__(message, {**(details or {}), "clarification_questions": clarification_questions})
        self.clarification_questions = clarification_questions

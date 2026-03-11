"""Validation helpers for inputs and Web2Campaign params."""

from typing import Any

from app.core.exceptions import ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


def validate_web2campaign_params(params: dict[str, str]) -> None:
    """
    Validate Web2Campaign params: if F9TimeToCall is provided, F9TimeFormat must also be provided.
    Raises ValidationError if invalid.
    """
    if "F9TimeToCall" in params and (params.get("F9TimeToCall") or "").strip():
        if not (params.get("F9TimeFormat") or "").strip():
            logger.warning(
                "web2campaign_validation_failed",
                extra={"reason": "F9TimeToCall requires F9TimeFormat", "params_keys": list(params.keys())},
            )
            raise ValidationError(
                "F9TimeToCall is provided; F9TimeFormat must also be provided",
                details={"params_keys": list(params.keys())},
            )


def validate_required_inputs(provided: dict[str, Any], required_keys: set[str]) -> list[str]:
    """Return list of missing required keys. Empty list if all present."""
    missing = [k for k in required_keys if not _has_value(provided.get(k))]
    if missing:
        logger.info("missing_input_detection", extra={"missing": missing, "required": list(required_keys)})
    return missing


def _has_value(v: Any) -> bool:
    """Return True if value is considered present (non-empty string, non-None number, etc.)."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, bool):
        return True
    return True

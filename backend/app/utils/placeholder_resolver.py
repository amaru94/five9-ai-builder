"""Safe placeholder resolution for {{key}} in strings and nested structures."""

import re
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

PLACEHOLDER_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def resolve_placeholders(value: Any, context: dict[str, Any]) -> Any:
    """
    Recursively resolve {{key}} placeholders in strings, dicts, and lists.
    Keys missing from context are left as {{key}} (no injection).
    """
    if isinstance(value, str):
        return _resolve_string(value, context)
    if isinstance(value, dict):
        return {k: resolve_placeholders(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_placeholders(item, context) for item in value]
    return value


def _resolve_string(s: str, context: dict[str, Any]) -> str:
    """Replace {{key}} with context[key] if present; else leave placeholder."""
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in context:
            v = context[key]
            return str(v) if v is not None else ""
        logger.warning("placeholder_missing", extra={"key": key, "available_keys": list(context.keys())})
        return match.group(0)

    return PLACEHOLDER_PATTERN.sub(repl, s)


def list_placeholders(value: Any) -> set[str]:
    """Return set of placeholder keys used in value (strings/dicts/lists)."""
    if isinstance(value, str):
        return set(PLACEHOLDER_PATTERN.findall(value))
    if isinstance(value, dict):
        out: set[str] = set()
        for v in value.values():
            out |= list_placeholders(v)
        return out
    if isinstance(value, list):
        out = set()
        for item in value:
            out |= list_placeholders(item)
        return out
    return set()

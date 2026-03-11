"""Template rendering using placeholder resolution."""

from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.utils.placeholder_resolver import resolve_placeholders

logger = get_logger(__name__)


def render_template(template: str | dict[str, Any], context: dict[str, Any]) -> str | dict[str, Any]:
    """
    Render a string or dict template with placeholders using context.
    Returns the same type as input.
    """
    return resolve_placeholders(template, context)


def load_prompt_template(prompts_dir: Path, name: str) -> str:
    """Load a prompt template from prompts_dir/name (e.g. routing_system.txt)."""
    path = prompts_dir / name
    if not path.is_file():
        logger.warning("prompt_template_not_found", extra={"path": str(path)})
        return ""
    return path.read_text(encoding="utf-8").strip()

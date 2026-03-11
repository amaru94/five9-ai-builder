"""Load skill definitions from JSON files."""

import json
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.models.skill_definition import SkillDefinition

logger = get_logger(__name__)


def load_skill_from_file(path: Path) -> SkillDefinition | None:
    """Load a single skill from a JSON file. Returns None on error."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return SkillDefinition.model_validate(data)
    except Exception as e:
        logger.exception("skill_load_failed", extra={"path": str(path), "error": str(e)})
        return None


def load_skills_from_dir(skills_dir: Path) -> dict[str, SkillDefinition]:
    """Load all .skill.json files from directory. Returns dict skill_id -> SkillDefinition."""
    result: dict[str, SkillDefinition] = {}
    if not skills_dir.is_dir():
        logger.warning("skills_dir_not_found", extra={"path": str(skills_dir)})
        return result
    for path in skills_dir.glob("*.skill.json"):
        skill = load_skill_from_file(path)
        if skill:
            result[skill.id] = skill
            logger.info("skill_loaded", extra={"skill_id": skill.id, "path": str(path)})
    return result

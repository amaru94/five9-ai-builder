"""Runtime registry of skills (from folder + optional registry JSON)."""

import json
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.skill_definition import SkillDefinition
from app.services.skill_loader import load_skills_from_dir

logger = get_logger(__name__)


class SkillRegistry:
    """In-memory registry of loaded skills. Built from skills dir at startup; writes registry JSON."""

    def __init__(self) -> None:
        self._skills: dict[str, SkillDefinition] = {}
        self._registry_path: Path | None = None

    def build_from_skills_dir(self, base_path: Path | None = None) -> None:
        """Load all skills from app/skills/*.skill.json, populate registry, and write app/registry/skills.registry.json."""
        settings = get_settings()
        root = base_path or Path(__file__).resolve().parent.parent.parent
        skills_dir = root / settings.skills_dir
        self._skills = load_skills_from_dir(skills_dir)
        registry_path = root / settings.registry_path
        self._registry_path = registry_path
        # Write registry JSON so it's available on disk
        registry_path.parent.mkdir(parents=True, exist_ok=True)
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(self.to_registry_dict(), f, indent=2, ensure_ascii=False)
        logger.info(
            "registry_built",
            extra={"skill_count": len(self._skills), "skill_ids": list(self._skills.keys()), "registry_path": str(registry_path)},
        )

    def get(self, skill_id: str) -> SkillDefinition | None:
        """Return skill by id or None."""
        return self._skills.get(skill_id)

    def list_skills(self) -> list[SkillDefinition]:
        """Return all skills in registry."""
        return list(self._skills.values())

    def list_ids(self) -> list[str]:
        """Return all skill ids."""
        return list(self._skills.keys())

    def to_registry_dict(self) -> dict[str, Any]:
        """Export registry as dict for skills.registry.json."""
        return {
            "version": "1.0",
            "skill_ids": self.list_ids(),
            "skills": {sid: s.model_dump(mode="json") for sid, s in self._skills.items()},
        }


# Singleton used by API
_registry: SkillRegistry | None = None


def get_registry() -> SkillRegistry:
    """Return the global skill registry; build from dir if not yet built."""
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
        _registry.build_from_skills_dir()
    return _registry

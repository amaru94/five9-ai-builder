"""Collect and validate required/optional inputs for skills."""

from app.core.exceptions import MissingInputError
from app.core.logging import get_logger
from app.models.skill_definition import SkillDefinition
from app.utils.validators import validate_required_inputs

logger = get_logger(__name__)


class InputCollectionService:
    """Validates that all required inputs are present; returns missing keys for prompts."""

    def get_missing_required(
        self,
        skill: SkillDefinition,
        provided: dict[str, str | int | float | bool],
    ) -> list[str]:
        """Return list of required input keys that are missing from provided."""
        required = skill.get_required_input_keys()
        return validate_required_inputs(provided or {}, required)

    def ensure_required(
        self,
        skill: SkillDefinition,
        provided: dict[str, str | int | float | bool],
    ) -> None:
        """Raise MissingInputError if any required input is missing."""
        missing = self.get_missing_required(skill, provided)
        if missing:
            logger.info("missing_input_detection", extra={"skill_id": skill.id, "missing": missing})
            raise MissingInputError(
                f"Missing required inputs for skill {skill.id}: {', '.join(missing)}",
                missing,
                details={"skill_id": skill.id},
            )

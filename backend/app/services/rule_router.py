"""Rules-based fallback router using trigger_phrases from skill files."""

from app.core.logging import get_logger
from app.models.router_result import RouterResult
from app.services.skill_registry import get_registry

logger = get_logger(__name__)


def rule_based_classify(user_message: str) -> RouterResult:
    """
    Match user message against skill routing.trigger_phrases.
    Returns RouterResult with skill_ids if any phrase matches.
    """
    message_lower = (user_message or "").strip().lower()
    if not message_lower:
        return RouterResult(skill_ids=[], confidence=0.0, source="rule", details={"reason": "empty"})

    registry = get_registry()
    matched: list[str] = []
    for skill in registry.list_skills():
        for phrase in (skill.routing.trigger_phrases or []):
            if phrase.lower() in message_lower:
                matched.append(skill.id)
                break

    if matched:
        logger.info(
            "routing_decision",
            extra={"source": "rule", "skill_ids": matched, "confidence": 0.8},
        )
        return RouterResult(
            skill_ids=matched,
            confidence=0.8,
            source="rule",
            details={"trigger_phrases_matched": True},
        )

    return RouterResult(
        skill_ids=[],
        confidence=0.0,
        source="rule",
        clarification_questions=["I didn't match that to a specific skill. Can you rephrase or choose: dialer, dispositions, Web2Campaign, scripts, reporting?"],
        details={"reason": "no_trigger_match"},
    )

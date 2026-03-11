"""Hybrid routing: LLM first (pluggable), rule fallback; low confidence -> clarification."""

from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.router_result import RouterResult
from app.services.llm_router import get_llm_router
from app.services.rule_router import rule_based_classify

logger = get_logger(__name__)


class RoutingService:
    """Orchestrates pluggable LLM router + rule fallback; enforces confidence threshold."""

    def __init__(self, llm_router: Any = None) -> None:
        self.settings = get_settings()
        self.llm_router = llm_router if llm_router is not None else get_llm_router()

    async def classify(self, user_message: str, context: dict[str, Any] | None = None) -> RouterResult:
        """
        Run hybrid routing: try LLM (or mock), then rule fallback.
        If confidence < threshold, return clarification_questions and do not set skill_ids.
        """
        # 1) LLM (or mock)
        llm_result = await self.llm_router.classify(user_message, context)
        if llm_result.confidence >= self.settings.routing_confidence_threshold and llm_result.skill_ids:
            logger.info(
                "routing_decision",
                extra={
                    "strategy": "llm",
                    "skill_ids": llm_result.skill_ids,
                    "confidence": llm_result.confidence,
                },
            )
            return llm_result

        # 2) Rule fallback
        rule_result = rule_based_classify(user_message)
        if rule_result.confidence >= self.settings.routing_confidence_threshold and rule_result.skill_ids:
            logger.info(
                "routing_decision",
                extra={
                    "strategy": "rule",
                    "skill_ids": rule_result.skill_ids,
                    "confidence": rule_result.confidence,
                },
            )
            return rule_result

        # 3) Low confidence: prefer LLM clarification questions if any
        questions = llm_result.clarification_questions or rule_result.clarification_questions or [
            "Could you specify what you'd like to do? (e.g. optimize dialer, set up dispositions, Web2Campaign)"
        ]
        logger.info(
            "routing_low_confidence",
            extra={"clarification_questions": questions},
        )
        return RouterResult(
            skill_ids=[],
            confidence=max(llm_result.confidence, rule_result.confidence),
            source="hybrid",
            clarification_questions=questions,
            details={"reason": "below_threshold", "threshold": self.settings.routing_confidence_threshold},
        )

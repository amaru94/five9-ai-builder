"""Mock LLM router provider: deterministic keyword-to-skill mapping. No external API calls."""

from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.router_result import RouterResult
from app.services.llm_router_protocol import LLMRouterProtocol

logger = get_logger(__name__)


class MockLLMRouter:
    """
    Mock LLM classifier implementing LLMRouterProtocol.
    Maps keywords to skill_ids; returns clarification when no match.
    Use for development and tests. Replace with an HTTP client to your LLM in production.
    """

    def __init__(self, confidence_when_matched: float = 0.85) -> None:
        self.settings = get_settings()
        self._confidence = confidence_when_matched
        self._keyword_to_skill: list[tuple[list[str], str]] = [
            (["discovery", "customer", "setup", "context"], "customer_discovery"),
            (["dialer", "optimization", "reach", "leads", "timeout"], "dialer_optimization"),
            (["disposition", "folder", "callback", "final"], "disposition_architecture"),
            (["dialing mode", "power", "progressive", "predictive", "abandon"], "dialing_mode_advisor"),
            (["asap", "web2campaign", "lead strategy", "asap window"], "asap_lead_strategy"),
            (["script", "html5", "agent script", "talk track"], "campaign_script_builder"),
            (["report", "reporting", "track", "csv"], "reporting_setup"),
            (["web2campaign", "add to list", "ingest", "addtolist"], "web2campaign_ingest"),
            (["skill management", "create skill", "list skills", "admin ws"], "admin_ws_skill_management"),
        ]

    async def classify(self, user_message: str, context: dict[str, Any] | None = None) -> RouterResult:
        """Classify using keyword matching; no external API."""
        context = context or {}
        message_lower = (user_message or "").strip().lower()
        if not message_lower:
            return RouterResult(
                skill_ids=[],
                confidence=0.0,
                source="llm_mock",
                clarification_questions=["What would you like help with today? (e.g. dialer, dispositions, Web2Campaign)"],
                details={"reason": "empty_message"},
            )

        matched: list[str] = []
        for keywords, skill_id in self._keyword_to_skill:
            if any(k in message_lower for k in keywords):
                matched.append(skill_id)

        if matched:
            logger.info(
                "routing_decision",
                extra={"source": "llm_mock", "skill_ids": matched, "confidence": self._confidence},
            )
            return RouterResult(
                skill_ids=list(dict.fromkeys(matched)),
                confidence=self._confidence,
                source="llm_mock",
                details={"matched_keywords": True},
            )

        return RouterResult(
            skill_ids=[],
            confidence=0.3,
            source="llm_mock",
            clarification_questions=[
                "Which area do you need help with? (e.g. dialer optimization, dispositions, Web2Campaign, scripts, reporting)",
            ],
            details={"reason": "no_keyword_match"},
        )

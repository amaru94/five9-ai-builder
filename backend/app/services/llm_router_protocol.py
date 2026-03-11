"""Pluggable LLM router interface. Implement this to use a real LLM classifier."""

from typing import Any, Protocol, runtime_checkable

from app.models.router_result import RouterResult


@runtime_checkable
class LLMRouterProtocol(Protocol):
    """Interface for LLM-style classifiers. Implement classify() and plug into RoutingService."""

    async def classify(self, user_message: str, context: dict[str, Any] | None = None) -> RouterResult:
        """
        Classify user message into one or more skill ids.
        Return RouterResult with skill_ids and confidence; use clarification_questions when confidence is low.
        """
        ...

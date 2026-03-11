"""LLM router factory: returns pluggable provider (Mock by default)."""

from app.core.config import get_settings
from app.services.llm_router_protocol import LLMRouterProtocol
from app.services.mock_llm_router import MockLLMRouter

# Optional: from app.services.remote_llm_router import RemoteLLMRouter


def get_llm_router() -> LLMRouterProtocol:
    """
    Return the configured LLM router. When llm_router_url is set, return a remote client;
    otherwise return MockLLMRouter.
    """
    settings = get_settings()
    if settings.llm_router_url:
        # Pluggable: return RemoteLLMRouter(settings.llm_router_url) when implemented
        pass
    return MockLLMRouter()

"""Router API: POST /router/classify."""

from typing import Any

from fastapi import APIRouter, HTTPException

from app.models.router_result import RouterResult
from app.services.routing_service import RoutingService

router = APIRouter(prefix="/router", tags=["router"])
_routing_service: RoutingService | None = None


def get_routing_service() -> RoutingService:
    global _routing_service
    if _routing_service is None:
        _routing_service = RoutingService()
    return _routing_service


@router.post("/classify", response_model=RouterResult)
async def classify(body: dict[str, Any]) -> RouterResult:
    """
    Classify user message into one or more skills (hybrid LLM + rule routing).
    Body: { "message": str, "context": optional dict }.
    """
    message = (body.get("message") or "").strip()
    context = body.get("context")
    result = await get_routing_service().classify(message, context)
    return result

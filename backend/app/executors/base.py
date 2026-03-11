"""Base types for executor request/response with metadata for logging."""

from typing import Any, NamedTuple


class RequestMeta(NamedTuple):
    """Sanitized request info for ExecutionLog.request_metadata."""

    metadata: dict[str, Any]


class ResponseMeta(NamedTuple):
    """Response summary for ExecutionLog.response_metadata."""

    metadata: dict[str, Any]
    status_code: int | None = None


def rendered_request(
    transport: str,
    action_id: str,
    skill_id: str,
    method: str | None = None,
    url: str | None = None,
    headers: dict[str, str] | None = None,
    body: Any = None,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a dict for dry_run: rendered request payload (no external call)."""
    out: dict[str, Any] = {"transport": transport, "action_id": action_id, "skill_id": skill_id}
    if method:
        out["method"] = method
    if url:
        out["url"] = url
    if headers:
        out["headers"] = headers
    if body is not None:
        out["body"] = body
    if params is not None:
        out["params"] = params
    return out

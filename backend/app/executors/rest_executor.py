"""REST action executor using httpx and placeholder resolution."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.api_action import ApiAction
from app.utils.placeholder_resolver import resolve_placeholders
from app.executors.base import RequestMeta, ResponseMeta, rendered_request

logger = get_logger(__name__)


class RestExecutor:
    """Execute REST actions; path/body/headers support {{placeholder}}."""

    def render_request(self, action: ApiAction, context: dict[str, Any]) -> dict[str, Any]:
        """Return rendered request payload for dry_run (no HTTP call)."""
        settings = get_settings()
        base = settings.five9_rest_base_url.rstrip("/")
        path = (action.path or "").strip()
        if path.startswith("/"):
            path = path[1:]
        url = f"{base}/{path}"
        url = resolve_placeholders(url, context)
        method = (action.method or "GET").upper()
        headers = dict(action.headers or {})
        headers = {k: resolve_placeholders(str(v), context) for k, v in headers.items()}
        body: Any = action.body
        if body is not None:
            body = resolve_placeholders(body, context)
        return rendered_request("REST", action.id, "", method=method, url=url, headers=headers or None, body=body)

    def execute(
        self,
        action: ApiAction,
        context: dict[str, Any],
        mocked: bool = False,
    ) -> tuple[RequestMeta, ResponseMeta]:
        """Build request from action template, resolve placeholders, then GET/POST/etc."""
        settings = get_settings()
        base = settings.five9_rest_base_url.rstrip("/")
        path = (action.path or "").strip()
        if path.startswith("/"):
            path = path[1:]
        url = f"{base}/{path}"
        url = resolve_placeholders(url, context)
        method = (action.method or "GET").upper()
        headers = dict(action.headers or {})
        headers = {k: resolve_placeholders(str(v), context) for k, v in headers.items()}
        body: Any = action.body
        if body is not None:
            body = resolve_placeholders(body, context)

        request_meta: dict[str, Any] = {
            "method": method,
            "url": url,
            "headers_keys": list(headers.keys()),
        }

        if mocked:
            logger.info(
                "rest_executor_mocked",
                extra={"action_id": action.id, "method": method, "path": path},
            )
            return (
                RequestMeta(metadata=request_meta),
                ResponseMeta(metadata={"mocked": True, "status_code": 200}, status_code=200),
            )

        try:
            with httpx.Client(timeout=30.0) as client:
                if method == "GET":
                    resp = client.get(url, headers=headers)
                elif method == "POST":
                    resp = client.post(url, headers=headers, json=body if isinstance(body, dict) else None, content=body if isinstance(body, (str, bytes)) else None)
                elif method == "PUT":
                    resp = client.put(url, headers=headers, json=body if isinstance(body, dict) else None)
                elif method == "PATCH":
                    resp = client.patch(url, headers=headers, json=body if isinstance(body, dict) else None)
                elif method == "DELETE":
                    resp = client.delete(url, headers=headers)
                else:
                    resp = client.request(method, url, headers=headers, json=body if isinstance(body, dict) else None)
                response_meta = ResponseMeta(
                    metadata={"status_code": resp.status_code, "mocked": False},
                    status_code=resp.status_code,
                )
                resp.raise_for_status()
                return (RequestMeta(metadata=request_meta), response_meta)
        except httpx.HTTPStatusError as e:
            return (
                RequestMeta(metadata=request_meta),
                ResponseMeta(metadata={"status_code": e.response.status_code, "error": str(e)}, status_code=e.response.status_code),
            )
        except Exception as e:
            logger.exception("rest_executor_error", extra={"action_id": action.id, "error": str(e)})
            raise

"""Web2Campaign AddToList executor; form-url-encoded POST or GET with F9TimeToCall/F9TimeFormat validation."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.api_action import ApiAction
from app.utils.placeholder_resolver import resolve_placeholders
from app.utils.validators import validate_web2campaign_params
from app.executors.base import RequestMeta, ResponseMeta, rendered_request

logger = get_logger(__name__)


class Web2CampaignExecutor:
    """Execute Web2Campaign AddToList (POST form or GET). Validates F9TimeToCall + F9TimeFormat."""

    def render_request(self, action: ApiAction, context: dict[str, Any]) -> dict[str, Any]:
        """Return rendered params and URL for dry_run (no HTTP call)."""
        params_template = action.web2campaign_params or {}
        params = {k: resolve_placeholders(str(v), context) for k, v in params_template.items()}
        validate_web2campaign_params(params)
        settings = get_settings()
        base = settings.five9_web2campaign_base_url.rstrip("/")
        url = f"{base}/AddToList"
        method = (action.web2campaign_method or "POST").upper()
        return rendered_request("WEB2CAMPAIGN", action.id, "", method=method, url=url, params=params)

    def execute(
        self,
        action: ApiAction,
        context: dict[str, Any],
        mocked: bool = False,
    ) -> tuple[RequestMeta, ResponseMeta]:
        """Resolve params from action.web2campaign_params, validate, then POST or GET."""
        params_template = action.web2campaign_params or {}
        params = {k: resolve_placeholders(str(v), context) for k, v in params_template.items()}
        validate_web2campaign_params(params)

        settings = get_settings()
        base = settings.five9_web2campaign_base_url.rstrip("/")
        url = f"{base}/AddToList"
        method = (action.web2campaign_method or "POST").upper()

        request_meta: dict[str, Any] = {
            "method": method,
            "url": url,
            "params_keys": list(params.keys()),
        }

        if mocked:
            logger.info(
                "web2campaign_executor_mocked",
                extra={"action_id": action.id, "params_keys": list(params.keys())},
            )
            return (
                RequestMeta(metadata=request_meta),
                ResponseMeta(metadata={"mocked": True, "status_code": 200}, status_code=200),
            )

        try:
            with httpx.Client(timeout=30.0) as client:
                if method == "GET":
                    resp = client.get(url, params=params)
                else:
                    resp = client.post(url, data=params)
                response_meta = ResponseMeta(
                    metadata={"status_code": resp.status_code, "mocked": False},
                    status_code=resp.status_code,
                )
                resp.raise_for_status()
                return (RequestMeta(metadata=request_meta), response_meta)
        except Exception as e:
            logger.exception("web2campaign_executor_error", extra={"action_id": action.id, "error": str(e)})
            raise

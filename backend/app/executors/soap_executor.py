"""SOAP Admin Web Services executor; generic operation + body template."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.api_action import ApiAction
from app.utils.xml_helpers import render_soap_body, sanitize_for_log
from app.executors.base import RequestMeta, ResponseMeta, rendered_request

logger = get_logger(__name__)


class SoapExecutor:
    """Execute SOAP actions; URL from config with optional {{ws_version}}, body from action template."""

    def render_request(self, action: ApiAction, context: dict[str, Any]) -> dict[str, Any]:
        """Return rendered SOAP envelope and URL for dry_run (no HTTP call)."""
        settings = get_settings()
        base = settings.five9_soap_base_url
        version = action.soap_version or "v11_5"
        if "{{ws_version}}" in base:
            base = base.replace("{{ws_version}}", version)
        elif "v11_5" in base and version != "v11_5":
            base = base.replace("v11_5", version)
        body_template = action.soap_body_template or ""
        if isinstance(body_template, dict):
            body_template = {
                "operation": action.soap_operation or "getSkills",
                "body": body_template.get("body", ""),
                "namespace": body_template.get("namespace", "http://service.admin.ws.five9.com/v11_5/"),
            }
        envelope = render_soap_body(body_template, context)
        return rendered_request("SOAP", action.id, "", method="POST", url=base, body=envelope)

    def execute(
        self,
        action: ApiAction,
        context: dict[str, Any],
        mocked: bool = False,
    ) -> tuple[RequestMeta, ResponseMeta]:
        """Build SOAP envelope, resolve placeholders, POST to AdminWebService."""
        settings = get_settings()
        # Resolve version in URL if present
        base = settings.five9_soap_base_url
        version = action.soap_version or "v11_5"
        if "{{ws_version}}" in base:
            base = base.replace("{{ws_version}}", version)
        elif "v11_5" in base and version != "v11_5":
            base = base.replace("v11_5", version)

        body_template = action.soap_body_template or ""
        if isinstance(body_template, dict):
            body_template = {
                "operation": action.soap_operation or "getSkills",
                "body": body_template.get("body", ""),
                "namespace": body_template.get("namespace", "http://service.admin.ws.five9.com/v11_5/"),
            }
        envelope = render_soap_body(body_template, context)

        request_meta: dict[str, Any] = {
            "url": base,
            "operation": action.soap_operation,
            "body_preview": sanitize_for_log(envelope, 200),
        }

        if mocked:
            logger.info(
                "soap_executor_mocked",
                extra={"action_id": action.id, "operation": action.soap_operation},
            )
            return (
                RequestMeta(metadata=request_meta),
                ResponseMeta(metadata={"mocked": True, "status_code": 200}, status_code=200),
            )

        try:
            headers = {"Content-Type": "text/xml; charset=utf-8"}
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(base, content=envelope, headers=headers)
                response_meta = ResponseMeta(
                    metadata={"status_code": resp.status_code, "mocked": False},
                    status_code=resp.status_code,
                )
                resp.raise_for_status()
                return (RequestMeta(metadata=request_meta), response_meta)
        except Exception as e:
            logger.exception("soap_executor_error", extra={"action_id": action.id, "error": str(e)})
            raise

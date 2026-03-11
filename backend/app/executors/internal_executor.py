"""INTERNAL action executor: artifact generation, no external HTTP."""

from typing import Any

from app.core.logging import get_logger
from app.models.api_action import ApiAction
from app.utils.placeholder_resolver import resolve_placeholders
from app.executors.base import RequestMeta, ResponseMeta, rendered_request

logger = get_logger(__name__)

# Five9 variable syntax: @entity.fieldname@ (e.g. @customer.zip@). Never invent field names.
FIVE9_ENTITY = "customer"  # or "lead" depending on script_type


def _parse_field_names(payload: dict[str, Any]) -> list[str]:
    """Extract field names from payload; only use provided names, never invent."""
    field_names = payload.get("field_names")
    if isinstance(field_names, list):
        return [str(f).strip() for f in field_names if f and str(f).strip()]
    if isinstance(field_names, str):
        return [f.strip() for f in field_names.replace(",", " ").split() if f.strip()]
    return []


def _generate_five9_script_html(payload: dict[str, Any]) -> str:
    """
    Build Five9 HTML5 script using exact variable syntax @entity.fieldname@.
    Uses only field names provided in payload; never invents fields.
    """
    field_names = _parse_field_names(payload)
    entity = payload.get("entity") or FIVE9_ENTITY
    script_type = (payload.get("script_type") or "lead_info_only").lower()
    lines = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='UTF-8'/><title>Five9 Agent Script</title></head><body>",
        "<div class='five9-script'>",
        "<p>Variables use Five9 syntax: @entity.fieldname@ (do not invent field names).</p>",
        "<table border='1' cellpadding='4'>",
        "<tr><th>Field</th><th>Value</th></tr>",
    ]
    for name in field_names:
        var = f"@{entity}.{name}@"
        lines.append(f"<tr><td>{name}</td><td>{var}</td></tr>")
    lines.append("</table>")
    if "talk_track" in script_type or "lead_info_plus" in script_type:
        lines.append("<hr/><h3>Talk track</h3><p>Use the fields above in your conversation.</p>")
    lines.append("</div></body></html>")
    return "\n".join(lines)


class InternalExecutor:
    """Execute INTERNAL actions (e.g. script builder, report CSV). No outbound calls."""

    def render_request(self, action: ApiAction, context: dict[str, Any]) -> dict[str, Any]:
        """Return rendered payload for dry_run (handler + payload; may include generated HTML for generate_script)."""
        payload = dict(action.internal_payload or {})
        payload = resolve_placeholders(payload, context)
        handler = action.internal_handler or "noop"
        body: dict[str, Any] = {"handler": handler, "payload": payload}
        if handler == "generate_script":
            body["html_output"] = _generate_five9_script_html(payload)
        return rendered_request("INTERNAL", action.id, "", body=body)

    def execute(
        self,
        action: ApiAction,
        context: dict[str, Any],
        mocked: bool = False,
    ) -> tuple[RequestMeta, ResponseMeta]:
        """Resolve payload placeholders and run handler by name; return metadata and HTML for generate_script."""
        payload = dict(action.internal_payload or {})
        payload = resolve_placeholders(payload, context)
        handler = action.internal_handler or "noop"

        request_meta: dict[str, Any] = {
            "handler": handler,
            "payload_keys": list(payload.keys()),
        }
        response_meta: dict[str, Any] = {"handler": handler, "status": "success"}

        if handler == "noop":
            pass
        elif handler == "generate_script":
            html = _generate_five9_script_html(payload)
            request_meta["artifact"] = "html5_script"
            response_meta["html_output"] = html
            response_meta["field_names_used"] = _parse_field_names(payload)
        elif handler == "generate_report_csv":
            request_meta["artifact"] = "report_csv"
        else:
            request_meta["handler"] = handler

        logger.info(
            "internal_executor",
            extra={"action_id": action.id, "handler": handler, "mocked": mocked},
        )
        return (
            RequestMeta(metadata=request_meta),
            ResponseMeta(metadata=response_meta),
        )

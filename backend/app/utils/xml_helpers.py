"""Helpers for SOAP/XML request building and sanitization."""

import re
from typing import Any

from app.core.logging import get_logger
from app.utils.placeholder_resolver import resolve_placeholders

logger = get_logger(__name__)


def render_soap_body(template: str | dict[str, Any], context: dict[str, Any]) -> str:
    """
    If template is dict, build a minimal SOAP envelope with the operation and body.
    If template is string, treat as full envelope template and resolve placeholders.
    """
    if isinstance(template, dict):
        # Build from structure, e.g. {"operation": "getSkills", "body": "<ns:skillNamePattern>.*</ns:skillNamePattern>"}
        op = template.get("operation", "")
        body = template.get("body", "")
        ns = template.get("namespace", "http://service.admin.ws.five9.com/v11_5/")
        body_rendered = resolve_placeholders(body, context) if isinstance(body, str) else str(body)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="{ns}">\n'
            "  <soapenv:Header/>\n"
            "  <soapenv:Body>\n"
            f"    <ns:{op}>\n      {body_rendered}\n    </ns:{op}>\n"
            "  </soapenv:Body>\n"
            "</soapenv:Envelope>"
        )
    s = str(template)
    return resolve_placeholders(s, context)


def sanitize_for_log(xml_or_str: str, max_len: int = 500) -> str:
    """Remove credentials and truncate for safe logging."""
    out = xml_or_str
    out = re.sub(r'password["\s:=]+[^"\s]+', "password=***", out, flags=re.I)
    out = re.sub(r'Authorization:\s*\S+', "Authorization: ***", out, flags=re.I)
    if len(out) > max_len:
        out = out[:max_len] + "..."
    return out

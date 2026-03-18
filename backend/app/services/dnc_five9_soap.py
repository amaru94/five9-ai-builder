"""Direct SOAP calls for domain DNC add/remove (Admin Web Service).

Voice DNC vs list/contact delete (never mixed here):
- checkDncForNumbers / removeNumbersFromDnc: **domain** call DNC for voice — only methods used for recovery.
- deleteRecordFromList, deleteContact, etc.: **not** called from this module.
"""

from __future__ import annotations

import re
from typing import Final

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_NS: Final[str] = "http://service.admin.ws.five9.com/v11_5/"


def _xml_text(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _envelope(operation: str, number_elements: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
        f'xmlns:ns="{_NS}">\n'
        "  <soapenv:Header/>\n"
        "  <soapenv:Body>\n"
        f"    <ns:{operation}>\n{number_elements}\n    </ns:{operation}>\n"
        "  </soapenv:Body>\n"
        "</soapenv:Envelope>"
    )


def _numbers_body(numbers: list[str], element_name: str = "numbers") -> str:
    """Repeated list elements (Five9 string[] style)."""
    return "\n".join(f"      <{element_name}>{_xml_text(n)}</{element_name}>" for n in numbers)


def soap_url() -> str:
    s = get_settings()
    base = s.five9_soap_base_url
    if "{{ws_version}}" in base:
        base = base.replace("{{ws_version}}", "v11_5")
    return base


def _auth(basic_override: tuple[str, str] | None = None) -> httpx.Auth | None:
    if basic_override:
        u, p = basic_override
        if u and p:
            return httpx.BasicAuth(u, p)
    s = get_settings()
    if s.five9_soap_username and s.five9_soap_password:
        return httpx.BasicAuth(s.five9_soap_username, s.five9_soap_password)
    return None


def add_numbers_to_dnc(
    numbers: list[str],
    *,
    mocked: bool,
    basic_auth: tuple[str, str] | None = None,
) -> None:
    if not numbers:
        return
    if mocked:
        logger.info("dnc_add_mocked", extra={"count": len(numbers)})
        return
    auth = _auth(basic_auth)
    if auth is None:
        raise RuntimeError(
            "Five9 credentials required: pass encoded_auth (Connect session) or set "
            "FIVE9_SOAP_USERNAME and FIVE9_SOAP_PASSWORD on the skill engine."
        )
    chunk_size = get_settings().dnc_soap_chunk_size
    url = soap_url()
    headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'}
    with httpx.Client(timeout=120.0, auth=auth) as client:
        for i in range(0, len(numbers), chunk_size):
            chunk = numbers[i : i + chunk_size]
            body = _envelope("addNumbersToDnc", _numbers_body(chunk))
            resp = client.post(url, content=body.encode("utf-8"), headers=headers)
            if resp.status_code >= 400:
                raise RuntimeError(f"addNumbersToDnc HTTP {resp.status_code}: {resp.text[:500]}")
            if "Fault" in resp.text or "faultcode" in resp.text.lower():
                fault = _extract_fault(resp.text)
                raise RuntimeError(f"addNumbersToDnc SOAP fault: {fault}")


def check_dnc_for_numbers(
    numbers: list[str],
    *,
    mocked: bool,
    basic_auth: tuple[str, str] | None = None,
    mock_cleared: bool = False,
) -> tuple[bool, str, set[str]]:
    """
    Returns (ok, raw_response_text, set of E.164 numbers that ARE on domain DNC).
    When mocked and mock_cleared=True, returns empty set (simulates post-remove check).
    """
    if not numbers:
        return True, "", set()
    if mocked:
        logger.info("dnc_check_mocked", extra={"count": len(numbers), "mock_cleared": mock_cleared})
        return True, "<mock/>", set() if mock_cleared else set(numbers)
    auth = _auth(basic_auth)
    if auth is None:
        raise RuntimeError("Five9 credentials required for checkDncForNumbers.")
    url = soap_url()
    headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'}
    chunk_size = get_settings().dnc_soap_chunk_size
    on_dnc: set[str] = set()
    full_text_parts: list[str] = []
    with httpx.Client(timeout=120.0, auth=auth) as client:
        for i in range(0, len(numbers), chunk_size):
            chunk = numbers[i : i + chunk_size]
            body = _envelope("checkDncForNumbers", _numbers_body(chunk))
            resp = client.post(url, content=body.encode("utf-8"), headers=headers)
            full_text_parts.append(resp.text)
            if resp.status_code >= 400:
                raise RuntimeError(f"checkDncForNumbers HTTP {resp.status_code}: {resp.text[:500]}")
            if "Fault" in resp.text or "faultcode" in resp.text.lower():
                fault = _extract_fault(resp.text)
                raise RuntimeError(f"checkDncForNumbers SOAP fault: {fault}")
            for m in re.finditer(r">(\+1\d{10})<", resp.text):
                on_dnc.add(m.group(1))
    return True, "\n---\n".join(full_text_parts), on_dnc


def remove_numbers_from_dnc(
    numbers: list[str],
    *,
    mocked: bool,
    basic_auth: tuple[str, str] | None = None,
) -> None:
    if not numbers:
        return
    if mocked:
        logger.info("dnc_remove_mocked", extra={"count": len(numbers)})
        return
    auth = _auth(basic_auth)
    if auth is None:
        raise RuntimeError(
            "Five9 credentials required: pass encoded_auth (Connect session) or set "
            "FIVE9_SOAP_USERNAME and FIVE9_SOAP_PASSWORD on the skill engine."
        )
    chunk_size = get_settings().dnc_soap_chunk_size
    url = soap_url()
    headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'}
    with httpx.Client(timeout=120.0, auth=auth) as client:
        for i in range(0, len(numbers), chunk_size):
            chunk = numbers[i : i + chunk_size]
            body = _envelope("removeNumbersFromDnc", _numbers_body(chunk))
            resp = client.post(url, content=body.encode("utf-8"), headers=headers)
            if resp.status_code >= 400:
                raise RuntimeError(f"removeNumbersFromDnc HTTP {resp.status_code}: {resp.text[:500]}")
            if "Fault" in resp.text or "faultcode" in resp.text.lower():
                fault = _extract_fault(resp.text)
                raise RuntimeError(f"removeNumbersFromDnc SOAP fault: {fault}")


def _extract_fault(xml_text: str) -> str:
    m = re.search(r"<faultstring[^>]*>([^<]+)</faultstring>", xml_text, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"<soapenv:Text[^>]*>([^<]+)</soapenv:Text>", xml_text, re.I)
    if m:
        return m.group(1).strip()
    return xml_text[:300]

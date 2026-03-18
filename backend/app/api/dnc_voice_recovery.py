"""
Voice domain DNC recovery: checkDncForNumbers → removeNumbersFromDnc (if on DNC) → checkDncForNumbers.
Does NOT call list/contact delete APIs.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dnc import _decode_basic, _verify_dnc_api_key
from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.dnc_five9_soap import check_dnc_for_numbers, remove_numbers_from_dnc
from app.services.dnc_normalize import normalize_bulk

logger = get_logger(__name__)

router = APIRouter(prefix="/dnc", tags=["dnc"])


class VoiceRecoveryRequest(BaseModel):
    numbers: list[str] = Field(..., min_length=1, max_length=100)
    encoded_auth: str | None = Field(default=None, description="Base64(user:pass) for Connect-style auth")
    force_remove_even_if_not_on_dnc: bool = False


def _mask(s: str, max_len: int = 2000) -> str:
    return (s[:max_len] + "…") if len(s) > max_len else s


@router.post("/voice-recovery")
def dnc_voice_recovery(
    body: VoiceRecoveryRequest,
    _: None = Depends(_verify_dnc_api_key),
) -> dict[str, Any]:
    settings = get_settings()
    basic_pair = None
    if (body.encoded_auth or "").strip():
        basic_pair = _decode_basic(body.encoded_auth or "")
    effective_mocked = settings.execution_mode == "mocked" and basic_pair is None

    try:
        e164_list, invalid = normalize_bulk(body.numbers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not e164_list:
        raise HTTPException(status_code=400, detail="No valid numbers.")

    steps: list[dict[str, Any]] = []

    try:
        ok1, raw1, on_before = check_dnc_for_numbers(
            e164_list, mocked=effective_mocked, basic_auth=basic_pair
        )
    except RuntimeError as e:
        logger.exception("voice_recovery_check_before")
        raise HTTPException(status_code=502, detail=str(e)) from e

    steps.append(
        {
            "step": "checkDncForNumbers_before",
            "on_domain_dnc": {n: n in on_before for n in e164_list},
            "response_truncated": _mask(raw1),
        }
    )

    to_remove = [n for n in e164_list if n in on_before or body.force_remove_even_if_not_on_dnc]
    skipped = [n for n in e164_list if n not in on_before and not body.force_remove_even_if_not_on_dnc]

    remove_ok = True
    remove_err = ""
    if to_remove:
        try:
            remove_numbers_from_dnc(
                to_remove, mocked=effective_mocked, basic_auth=basic_pair
            )
            steps.append(
                {
                    "step": "removeNumbersFromDnc",
                    "numbers": to_remove,
                    "note": "Only domain DNC; no list/contact delete in this codebase.",
                }
            )
        except RuntimeError as e:
            remove_ok = False
            remove_err = str(e)
            steps.append({"step": "removeNumbersFromDnc", "error": remove_err})
    else:
        steps.append(
            {
                "step": "removeNumbersFromDnc_skipped",
                "reason": "Not on domain DNC per check",
                "skipped": skipped,
            }
        )

    try:
        ok2, raw2, on_after = check_dnc_for_numbers(
            e164_list,
            mocked=effective_mocked,
            basic_auth=basic_pair,
            mock_cleared=bool(to_remove) and remove_ok and effective_mocked,
        )
    except RuntimeError as e:
        steps.append({"step": "checkDncForNumbers_after_error", "error": str(e)})
        on_after = set()

    steps.append(
        {
            "step": "checkDncForNumbers_after",
            "on_domain_dnc": {n: n in on_after for n in e164_list},
            "response_truncated": _mask(raw2),
        }
    )

    logger.info(
        "dnc_voice_recovery_done",
        extra={
            "numbers": e164_list,
            "removed": to_remove if remove_ok else [],
            "on_after": [n for n in e164_list if n in on_after],
        },
    )

    return {
        "ok": remove_ok and ok1,
        "flow": "voice_domain_dnc_only",
        "methods_used": ["checkDncForNumbers", "removeNumbersFromDnc", "checkDncForNumbers"],
        "no_list_or_contact_deletes": True,
        "steps": steps,
        "summary": {
            "numbers": e164_list,
            "on_domain_dnc_before": {n: n in on_before for n in e164_list},
            "remove_called": bool(to_remove) and remove_ok,
            "on_domain_dnc_after": {n: n in on_after for n in e164_list},
            "skipped_not_on_dnc": skipped,
            "list_contact_note": "Not verified via API; if still not dialable, check disposition/finalized/list rules.",
        },
        "detail": remove_err or None,
        "invalid_samples": invalid[:10],
    }

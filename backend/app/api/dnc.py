"""Bulk domain DNC add/remove: up to 10k US 10-digit numbers → E.164; add queues after hours."""

import base64
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services import dnc_queue_store as store
from app.services.dnc_five9_soap import add_numbers_to_dnc, remove_numbers_from_dnc
from app.services.dnc_normalize import MAX_DNC_BULK, normalize_bulk
from app.services.dnc_pt_window import is_dnc_add_allowed_now_pt

logger = get_logger(__name__)

router = APIRouter(prefix="/dnc", tags=["dnc"])


def _verify_dnc_api_key(
    x_dnc_api_key: str | None = Header(None, alias="X-DNC-API-Key"),
) -> None:
    expected = (get_settings().dnc_api_key or "").strip()
    if not expected:
        return
    if not x_dnc_api_key or x_dnc_api_key.strip() != expected:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing X-DNC-API-Key header.",
        )

QUEUED_MESSAGE = (
    "Bulk actions have been scheduled for after-hours processing (queue for later). "
    "Domain DNC adds run automatically between 11:00 PM and 6:00 AM Pacific."
)


def _decode_basic(encoded_auth: str) -> tuple[str, str]:
    """Base64(user:password) from Builder Connect session."""
    try:
        raw = base64.b64decode(encoded_auth.strip().encode("ascii"), validate=True).decode("utf-8")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid encoded_auth (Base64 of username:password).",
        ) from e
    if len(raw) > 4096 or ":" not in raw:
        raise HTTPException(status_code=400, detail="Invalid credential format.")
    user, _, password = raw.partition(":")
    if not user or not password:
        raise HTTPException(status_code=400, detail="Invalid credential format.")
    return user, password


class DncBulkRequest(BaseModel):
    action: Literal["add", "remove"]
    numbers: list[str] = Field(
        ...,
        description="Up to 10,000 unique US numbers as 10 digits (any formatting accepted).",
    )
    encoded_auth: str | None = Field(
        default=None,
        description="Optional Base64(user:password) — same as Builder Connect; uses real Five9 SOAP.",
    )

    @field_validator("numbers")
    @classmethod
    def cap_row_count(cls, v: list[str]) -> list[str]:
        if len(v) > 12_000:
            raise ValueError(
                "At most 12,000 rows per request; up to 10,000 unique valid numbers are processed."
            )
        return v


class DncBulkResponse(BaseModel):
    ok: bool
    action: str
    count: int
    queued: bool
    message: str
    job_id: str | None = None
    invalid_samples: list[str] = Field(default_factory=list)
    e164_preview: list[str] = Field(default_factory=list)
    simulated: bool = Field(
        default=False,
        description="True if Five9 was not called (mock mode, no credentials).",
    )


@router.post("/bulk", response_model=DncBulkResponse)
def dnc_bulk(
    body: DncBulkRequest,
    _: None = Depends(_verify_dnc_api_key),
) -> DncBulkResponse:
    if not body.numbers:
        raise HTTPException(status_code=400, detail="No numbers provided.")

    try:
        e164_list, invalid = normalize_bulk(body.numbers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not e164_list:
        raise HTTPException(
            status_code=400,
            detail="No valid 10-digit US numbers after normalization.",
        )

    settings = get_settings()
    basic_pair: tuple[str, str] | None = None
    if (body.encoded_auth or "").strip():
        basic_pair = _decode_basic(body.encoded_auth or "")
    # Session auth → always call real Five9 (ignore EXECUTION_MODE=mocked for this request)
    effective_mocked = settings.execution_mode == "mocked" and basic_pair is None
    preview = e164_list[:5]

    if body.action == "remove":
        try:
            remove_numbers_from_dnc(
                e164_list,
                mocked=effective_mocked,
                basic_auth=basic_pair,
            )
        except RuntimeError as e:
            logger.exception("dnc_remove_error")
            raise HTTPException(status_code=502, detail=str(e)) from e
        if effective_mocked:
            msg = (
                f"[Simulated only] Would remove {len(e164_list)} number(s) from domain DNC. "
                "Nothing changed in Five9. **Connect** in the Builder (so your session is sent) "
                "or set EXECUTION_MODE=real plus FIVE9_SOAP_* on the skill engine."
            )
        else:
            msg = (
                f"Removed {len(e164_list)} number(s) from the domain DNC list in Five9 "
                f"({'your Connect session' if basic_pair else 'server credentials'})."
            )
        return DncBulkResponse(
            ok=True,
            action="remove",
            count=len(e164_list),
            queued=False,
            message=msg,
            invalid_samples=invalid[:10],
            e164_preview=preview,
            simulated=effective_mocked,
        )

    # add
    if not is_dnc_add_allowed_now_pt():
        job_id = store.enqueue_add(e164_list)
        logger.info("dnc_add_queued", extra={"job_id": job_id, "count": len(e164_list)})
        return DncBulkResponse(
            ok=True,
            action="add",
            count=len(e164_list),
            queued=True,
            message=QUEUED_MESSAGE,
            job_id=job_id,
            invalid_samples=invalid[:10],
            e164_preview=preview,
        )

    if not effective_mocked and basic_pair is None and (
        not settings.five9_soap_username or not settings.five9_soap_password
    ):
        raise HTTPException(
            status_code=503,
            detail="Connect in Builder (session) or set FIVE9_SOAP_USERNAME/PASSWORD for immediate DNC add.",
        )

    try:
        add_numbers_to_dnc(e164_list, mocked=effective_mocked, basic_auth=basic_pair)
    except RuntimeError as e:
        logger.exception("dnc_add_error")
        # Outside window race or SOAP fault → queue for later
        err = str(e).lower()
        if "11" in err or "pm" in err or "window" in err or "time" in err or "fault" in err:
            job_id = store.enqueue_add(e164_list)
            return DncBulkResponse(
                ok=True,
                action="add",
                count=len(e164_list),
                queued=True,
                message=QUEUED_MESSAGE + " (API reported off-window; job queued.)",
                job_id=job_id,
                invalid_samples=invalid[:10],
                e164_preview=preview,
            )
        raise HTTPException(status_code=502, detail=str(e)) from e

    add_msg = f"Submitted {len(e164_list)} number(s) to the domain DNC list."
    if effective_mocked:
        add_msg = (
            "[Simulated only] No change in Five9. Connect in Builder or configure server SOAP credentials."
        )
    return DncBulkResponse(
        ok=True,
        action="add",
        count=len(e164_list),
        queued=False,
        message=add_msg,
        invalid_samples=invalid[:10],
        e164_preview=preview,
        simulated=effective_mocked,
    )


@router.get("/jobs/{job_id}")
def dnc_job_status(
    job_id: str,
    _: None = Depends(_verify_dnc_api_key),
) -> dict[str, Any]:
    row = store.get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {
        "id": row["id"],
        "action": row["action"],
        "status": row["status"],
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
        "error": row["error"],
    }

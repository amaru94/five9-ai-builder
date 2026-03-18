"""Normalize US phone input to E.164 (+1...) with bulk cap."""

import re
from typing import Final

MAX_DNC_BULK: Final[int] = 10_000


def normalize_us_10_to_e164(raw: str) -> str | None:
    """
    Accept 10-digit NANP or 11-digit starting with 1.
    Returns E.164 like +15551234567, or None if invalid.
    """
    if not raw or not isinstance(raw, str):
        return None
    digits = re.sub(r"\D", "", raw.strip())
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10 or not digits.isdigit():
        return None
    if digits[0] in ("0", "1"):  # invalid area code first digit for NANP
        return None
    return f"+1{digits}"


def normalize_bulk(numbers: list[str]) -> tuple[list[str], list[str]]:
    """
    Dedupe preserving order, cap MAX_DNC_BULK.
    Returns (e164_list, invalid_inputs) — invalid are original strings that failed.
    """
    seen: set[str] = set()
    out: list[str] = []
    invalid: list[str] = []
    for raw in numbers:
        if raw is None:
            continue
        s = str(raw).strip()
        if not s:
            continue
        e164 = normalize_us_10_to_e164(s)
        if e164 is None:
            invalid.append(s[:64])
            continue
        if e164 in seen:
            continue
        seen.add(e164)
        out.append(e164)
        if len(out) > MAX_DNC_BULK:
            raise ValueError(f"Maximum {MAX_DNC_BULK} unique numbers allowed per request.")
    return out, invalid

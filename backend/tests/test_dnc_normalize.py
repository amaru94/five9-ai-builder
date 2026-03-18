"""DNC normalization and bulk cap."""

import pytest

from app.services.dnc_normalize import MAX_DNC_BULK, normalize_bulk, normalize_us_10_to_e164


def test_normalize_10_digit():
    assert normalize_us_10_to_e164("5551234567") == "+15551234567"
    assert normalize_us_10_to_e164("(555) 123-4567") == "+15551234567"
    assert normalize_us_10_to_e164("15551234567") == "+15551234567"


def test_normalize_invalid():
    assert normalize_us_10_to_e164("123") is None
    assert normalize_us_10_to_e164("") is None
    assert normalize_us_10_to_e164("0123456789") is None  # invalid area code


def test_dedupe_and_cap():
    ok, bad = normalize_bulk(["5551234567", "(555) 123-4567", "5559876543"])
    assert ok == ["+15551234567", "+15559876543"]
    assert not bad


def test_max_bulk():
    nums = [f"{300 + i // 1000:03d}555{i % 1000:04d}" for i in range(MAX_DNC_BULK + 1)]
    with pytest.raises(ValueError, match="10.?000"):
        normalize_bulk(nums)

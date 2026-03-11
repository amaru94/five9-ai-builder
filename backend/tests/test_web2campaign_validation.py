"""Tests for Web2Campaign F9TimeToCall / F9TimeFormat validation."""

import pytest

from app.utils.validators import validate_web2campaign_params
from app.core.exceptions import ValidationError


def test_f9timetocall_requires_f9timeformat():
    """If F9TimeToCall is provided, F9TimeFormat must also be provided."""
    with pytest.raises(ValidationError) as exc:
        validate_web2campaign_params({"F9TimeToCall": "14:00", "F9domain": "d", "F9list": "l", "number1": "1"})
    assert "F9TimeFormat" in str(exc.value)


def test_f9timetocall_with_f9timeformat_ok():
    """When both F9TimeToCall and F9TimeFormat are provided, validation passes."""
    validate_web2campaign_params({
        "F9TimeToCall": "14:00",
        "F9TimeFormat": "HH:mm",
        "F9domain": "d",
        "F9list": "l",
        "number1": "1",
    })


def test_no_f9timetocall_ok():
    """No F9TimeToCall does not require F9TimeFormat."""
    validate_web2campaign_params({"F9domain": "d", "F9list": "l", "number1": "1"})


def test_f9timetocall_empty_ok():
    """Empty F9TimeToCall does not require F9TimeFormat."""
    validate_web2campaign_params({"F9TimeToCall": "", "F9TimeFormat": "", "F9domain": "d", "F9list": "l", "number1": "1"})

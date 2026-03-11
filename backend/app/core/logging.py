"""Structured JSON logging for the skill engine."""

import logging
import sys
from typing import Any

from app.core.config import get_settings


def setup_logging() -> None:
    """Configure root logger with JSON-structured handler."""
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    # Simple JSON-like structure: one log line per record with key=value pairs
    class StructuredFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            log_obj: dict[str, Any] = {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            if hasattr(record, "extra") and isinstance(record.extra, dict):
                log_obj.update(record.extra)
            # Flatten for easy parsing: "key=value key2=value2"
            parts = [f'{k}="{v}"' if isinstance(v, str) and " " in v else f"{k}={v}" for k, v in log_obj.items()]
            return " ".join(parts)

    formatter = StructuredFormatter()
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a logger for the given module name."""
    return logging.getLogger(name)

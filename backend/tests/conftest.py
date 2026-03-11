"""Pytest fixtures and config. Run from backend with: python -m pytest tests/ -v."""

import sys
from pathlib import Path

# Ensure backend root is on path
backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

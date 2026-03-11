# Five9 AI Skill Engine

## Cursor Cloud specific instructions

### Architecture
Python FastAPI backend for a modular Five9 AI skill engine. Classifies user messages into skills, collects inputs, plans and executes REST/SOAP/Web2Campaign actions. See `backend/README.md` for full API docs and examples.

### Prerequisites
- Python 3.12 with `python3.12-venv` installed
- Virtual environment at `backend/.venv` with `backend/requirements.txt` installed
- `backend/.env` copied from `backend/.env.example` (defaults to mocked execution mode)

### Key commands (all from `backend/` directory)
- `source .venv/bin/activate && uvicorn app.main:app --reload --port 8000` — start dev server
- `source .venv/bin/activate && python -m pytest tests/ -v` — run tests
- Swagger UI at http://localhost:8000/docs
- Health check at http://localhost:8000/health

### Gotchas
- `app/services/__init__.py` re-exports `get_llm_router` (not `LLMRouter`). If imports fail with `ImportError: cannot import name 'LLMRouter'`, the `__init__.py` may have been reverted.
- `SkillRun` model must include `rendered_request_payloads` field for dry_run to work. If execute dry_run returns 500, check the model has this field.
- One test (`test_rule_based_classify_dialer`) is a known pre-existing failure — the rule-based router doesn't match "dialer" in that phrasing.
- `EXECUTION_MODE=mocked` (default) means no actual outbound HTTP to Five9. Set to `real` in `.env` to call real APIs.

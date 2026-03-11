# Five9 AI Builder

Backend for a modular Five9 AI skill engine: classify, plan, and execute REST, SOAP, and Web2Campaign actions for Five9 operations/copilot flows.

## What's in this repo

- **`backend/`** — Python FastAPI app (skill registry, routing, execution, sessions).  
  **→ Full setup and API docs: [backend/README.md](backend/README.md)**

## Quick start

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

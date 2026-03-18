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

## Local dev — builder + skill engine (two terminals)

Everything below assumes **both apps run on your machine**.

| Terminal | Command | URL |
|----------|---------|-----|
| **1 — Backend** | `cd backend` → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` | http://127.0.0.1:8000 |
| **2 — Next app** | `cd five9-ai-builder` → `npm install` → `npm run dev` | http://localhost:3000 |

In **`five9-ai-builder/.env.local`** (create from [five9-ai-builder/.env.example](five9-ai-builder/.env.example)):

- **`SKILL_ENGINE_URL=http://127.0.0.1:8000`** — required for **chat DNC**, **Admin → Domain DNC bulk**, and any feature that calls the Python API.
- After changing `.env.local`, **restart** `npm run dev`.

**Domain DNC from chat** (while **Connected**): **block** numbers only, e.g. `add 8162002900 to dnc` or `block 8162002900 on dnc`. **Unblock** (*remove from domain DNC*) is **not** run from chat—Five9’s unblock API can affect **contact/list records**, not just DNC. Use **Five9 Admin → Lists → DNC** or **Admin → Domain DNC bulk** (with confirmation) to unblock.

**Admin → Domain DNC bulk** (large lists) still proxies to the skill engine if `SKILL_ENGINE_URL` is set; if the backend is off, you’ll get a clear **503** instead of a generic 500.

Optional: **`backend/.env`** with `FIVE9_SOAP_*` for queued after-hours adds / server-only flows.

## Domain DNC (add / remove numbers)

Single numbers or bulk (up to **10k** unique 10-digit US numbers → **E.164**). **Remove** runs immediately; **add** outside 11 PM–6 AM Pacific is **queued for after-hours**.

- **API:** `POST /dnc/bulk` — see [backend/README.md](backend/README.md#domain-dnc-bulk-dncbulk).
- **UI (five9-ai-builder):** Admin → **Domain DNC bulk** (set `SKILL_ENGINE_URL` to the backend).

The builder **injects a Domain DNC playbook section** automatically (unless you override the **Domain DNC** module in Admin → Playbook). For production, set **`DNC_API_KEY`** on the backend and **`SKILL_ENGINE_DNC_KEY`** on the Next app to match. See **`five9-ai-builder/.env.example`**.

### Deploy

Step-by-step for **Vercel + Railway**: **[DEPLOY.md](./DEPLOY.md)**.

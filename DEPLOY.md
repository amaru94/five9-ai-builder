# Deploy Five9 AI Builder (monorepo)

You deploy **two pieces**:

| App | Stack | Suggested host |
|-----|--------|----------------|
| **five9-ai-builder** | Next.js 14 | [Vercel](https://vercel.com) |
| **backend** | FastAPI | [Railway](https://railway.app), [Render](https://render.com), Fly.io |

---

## 1. Backend (FastAPI)

### Railway (recommended)

1. [Railway](https://railway.app) → **New project** → **Deploy from GitHub** → select this repo.
2. Add a **new service** → **Empty service** → connect the same repo.
3. Open the service → **Settings**:
   - **Root Directory**: `backend`
   - Railway reads `backend/railway.toml` and `backend/Dockerfile`.
4. **Variables** (example):

   | Variable | Example |
   |----------|---------|
   | `EXECUTION_MODE` | `real` |
   | `FIVE9_SOAP_USERNAME` | Five9 admin API user |
   | `FIVE9_SOAP_PASSWORD` | Five9 admin API password |
   | `DNC_API_KEY` | Long random string (required if exposing DNC API) |
   | `FIVE9_SOAP_BASE_URL` | `https://api.five9.com/wsadmin/v11_5/AdminWebService` |

5. **DNC queue persistence** (optional): **Settings → Volumes** → mount path **`/data`**.  
   Without a volume, queued DNC jobs are lost when the container restarts.
6. **Generate domain** → copy public URL, e.g. `https://your-api.up.railway.app`.

Health check: `GET /health`  
API docs: `https://your-api.../docs`

### Render

1. **New → Web Service** → connect repo, **Root Directory** `backend`.
2. **Runtime**: Docker (uses `Dockerfile`).
3. Set the same env vars as above. Add a **Disk** mounted at `/data` if you need persistent DNC queue.

---

## 2. Frontend (Next.js)

### Vercel

1. [Vercel](https://vercel.com) → **Add New Project** → import this repo.
2. **Root Directory**: `five9-ai-builder`
3. **Environment variables**:

   | Variable | Value |
   |----------|--------|
   | `DATABASE_URL` | PostgreSQL (e.g. Railway Postgres or Neon) |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://your-app.vercel.app` (production URL) |
   | `ANTHROPIC_API_KEY` | Your key |
   | `ADMIN_PASSWORD` | Strong password for playbook admin |
   | `SKILL_ENGINE_URL` | Backend public URL, e.g. `https://your-api.up.railway.app` |
   | `SKILL_ENGINE_DNC_KEY` | Same as backend `DNC_API_KEY` if you set it |

4. **Build**: If you use Prisma, ensure `prisma/schema.prisma` is in the repo and add to `package.json`:

   ```json
   "scripts": {
     "postinstall": "prisma generate"
   }
   ```

   Then run migrations once (local or CI) against production DB:  
   `npx prisma migrate deploy`

5. Deploy. Set **Production Branch** if needed.

---

## 3. After deploy

- Open `https://your-app.vercel.app` → sign in → **Admin** → **Domain DNC bulk** should call the backend (check browser network tab if errors).
- CORS: the Next app calls the backend **server-side** via `SKILL_ENGINE_URL`, so browser CORS to the Python API is usually not required for DNC.

---

## 4. Quick checklist

- [ ] Backend URL reachable (`/health` = `ok`)
- [ ] `NEXTAUTH_URL` matches the exact Vercel production URL (no trailing slash issues)
- [ ] `SKILL_ENGINE_URL` = backend base URL (no trailing slash)
- [ ] `DNC_API_KEY` / `SKILL_ENGINE_DNC_KEY` match when using secured DNC
- [ ] Five9 credentials + `EXECUTION_MODE=real` for live SOAP/DNC

---

## 5. One-command local Docker (backend only)

```bash
cd backend
docker build -t five9-skill-engine .
docker run -p 8000:8000 -e EXECUTION_MODE=mocked five9-skill-engine
```

Open http://localhost:8000/docs

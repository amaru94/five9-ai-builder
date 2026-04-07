# Five9 AI Builder (SaaS skeleton)

This repo is a production-ready **starting point** for your Five9 AI Builder SaaS:

- Next.js (App Router)
- Postgres (Railway)
- Prisma
- NextAuth (email+password)
- Backend routes:
  - `/api/ai/chat` (OpenAI Responses API)
  - `/api/five9/soap` (Five9 SOAP proxy)
  - `/api/changes` (audit log)

## Quick start

1) Install deps

```bash
npm i
```

2) Create `.env` from `.env.example`

3) Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

4) Run

```bash
npm run dev
```

## Environment variables

- `DATABASE_URL` Postgres connection string
- `NEXTAUTH_SECRET` random secret
- `OPENAI_API_KEY` your OpenAI key
- `OPENAI_MODEL` optional (defaults to `gpt-5`)

## Security stance (MVP)

- Five9 credentials are **session-only** in the browser.
- Password plaintext is wiped immediately after Base64 encoding.
- Five9 requests go through the backend proxy to avoid CORS.

## Next steps

- Add Stripe billing + pricing page
- Add multi-workspace switcher
- Add IVR **Blueprint JSON → XML compiler** (recommended) so IVR generation is always valid

import { NextResponse } from "next/server";

/**
 * Proxies to Python skill engine POST /dnc/bulk.
 * Set SKILL_ENGINE_URL=http://localhost:8000 in .env.local
 */
export async function POST(req: Request) {
  const base = process.env.SKILL_ENGINE_URL?.replace(/\/$/, "");
  if (!base) {
    return NextResponse.json(
      { error: "SKILL_ENGINE_URL is not configured (backend URL)." },
      { status: 503 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const dncKey = process.env.SKILL_ENGINE_DNC_KEY?.trim();
  if (dncKey) headers["X-DNC-API-Key"] = dncKey;

  try {
    const r = await fetch(`${base}/dnc/bulk`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({ detail: r.statusText || "Bad response from skill engine" }));
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    const refused =
      e instanceof Error &&
      (e.message.includes("fetch failed") ||
        (e as Error & { cause?: { code?: string } }).cause?.code === "ECONNREFUSED");
    const msg = refused
      ? `Skill engine not running at ${base}. Start: cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 — or use chat DNC while **Connected** (no Python needed).`
      : e instanceof Error
        ? e.message
        : String(e);
    return NextResponse.json(
      { ok: false, detail: msg, code: refused ? "ECONNREFUSED" : "SKILL_ENGINE_FETCH_ERROR" },
      { status: 503 }
    );
  }
}

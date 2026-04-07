import { NextResponse } from "next/server";
import { getAdminPassword, createAdminToken, getAdminCookieName } from "@/lib/admin";

export async function POST(req: Request) {
  const password = getAdminPassword();
  if (!password) {
    return NextResponse.json({ error: "Admin not configured (set ADMIN_PASSWORD)" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const given = (body?.password != null ? String(body.password) : "").trim();
  if (given !== password) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const token = createAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getAdminCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_playbook";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getAdminPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SECRET ?? null;
  return raw != null ? String(raw).trim() : null;
}

export function createAdminToken(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.ADMIN_SECRET || "fallback-change-me";
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyAdminToken(token: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || process.env.ADMIN_SECRET || "fallback-change-me";
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || exp < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(expStr).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

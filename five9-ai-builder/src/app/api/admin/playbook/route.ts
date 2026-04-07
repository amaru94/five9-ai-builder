import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, getAdminCookieName } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const PLAYBOOK_KEYS = [
  "dispositions",
  "campaigns",
  "skills",
  "lists",
  "variables",
  "not_ready_codes",
  "ivrs",
  "campaign_profiles",
  "reports",
  "contact_fields",
  "dnc",
] as const;

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminCookieName())?.value;
  return !!token && verifyAdminToken(token);
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const modules: Record<string, string> = {};
  for (const key of PLAYBOOK_KEYS) modules[key] = "";
  try {
    const rows = await prisma.playbookModule.findMany();
    for (const r of rows) modules[r.moduleKey] = r.content;
  } catch (e) {
    console.error("PlaybookModule fetch failed (run prisma migrate?):", e);
    // Table may not exist yet; return empty modules so admin can still open the page
  }
  return NextResponse.json({ modules });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const modules = body?.modules ?? {};
  try {
    const existing = await prisma.playbookModule.findMany();
    const existingByKey: Record<string, string> = {};
    for (const r of existing) existingByKey[r.moduleKey] = r.content;

    for (const key of PLAYBOOK_KEYS) {
      const newContent = typeof modules[key] === "string" ? modules[key] : "";
      const oldContent = existingByKey[key] ?? "";

      if (oldContent.trim() && oldContent !== newContent) {
        await prisma.playbookModuleVersion.create({
          data: { moduleKey: key, content: oldContent },
        });
      }

      await prisma.playbookModule.upsert({
        where: { moduleKey: key },
        create: { moduleKey: key, content: newContent },
        update: { content: newContent },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PlaybookModule save failed:", e);
    return NextResponse.json(
      { error: "Save failed. Run: npx prisma migrate dev --name add_playbook_module" },
      { status: 500 }
    );
  }
}

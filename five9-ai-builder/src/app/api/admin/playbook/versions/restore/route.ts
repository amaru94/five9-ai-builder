import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, getAdminCookieName } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminCookieName())?.value;
  return !!token && verifyAdminToken(token);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const versionId = body?.versionId;
  if (!versionId || typeof versionId !== "string") {
    return NextResponse.json({ error: "versionId required" }, { status: 400 });
  }
  try {
    const version = await prisma.playbookModuleVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const current = await prisma.playbookModule.findUnique({
      where: { moduleKey: version.moduleKey },
    });
    if (current?.content.trim() && current.content !== version.content) {
      await prisma.playbookModuleVersion.create({
        data: { moduleKey: version.moduleKey, content: current.content },
      });
    }
    await prisma.playbookModule.upsert({
      where: { moduleKey: version.moduleKey },
      create: { moduleKey: version.moduleKey, content: version.content },
      update: { content: version.content },
    });
    return NextResponse.json({ ok: true, moduleKey: version.moduleKey });
  } catch (e) {
    console.error("Restore failed:", e);
    return NextResponse.json({ error: "Restore failed" }, { status: 500 });
  }
}

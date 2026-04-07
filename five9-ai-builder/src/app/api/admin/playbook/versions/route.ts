import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, getAdminCookieName } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminCookieName())?.value;
  return !!token && verifyAdminToken(token);
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const moduleKey = searchParams.get("moduleKey");
  try {
    const where = moduleKey ? { moduleKey } : {};
    const rows = await prisma.playbookModuleVersion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: moduleKey ? 50 : 200,
    });
    const byModule: Record<string, { id: string; content: string; createdAt: string }[]> = {};
    for (const r of rows) {
      if (!byModule[r.moduleKey]) byModule[r.moduleKey] = [];
      byModule[r.moduleKey].push({
        id: r.id,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      });
    }
    return NextResponse.json({ versions: byModule });
  } catch (e) {
    console.error("PlaybookModuleVersion fetch failed:", e);
    return NextResponse.json({ versions: {} });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DOMAIN_DNC_PLAYBOOK_DEFAULT } from "@/lib/domainDncPlaybook";

const MODULE_LABELS: Record<string, string> = {
  dispositions: "Dispositions",
  campaigns: "Campaigns",
  skills: "Skills",
  lists: "Lists",
  variables: "Variables",
  not_ready_codes: "Not ready codes",
  ivrs: "IVRs",
  campaign_profiles: "Campaign profiles",
  reports: "Reports",
  contact_fields: "Contact fields",
  dnc: "Domain DNC",
};

export async function GET() {
  let rows: { moduleKey: string; content: string }[] = [];
  try {
    rows = await prisma.playbookModule.findMany();
  } catch {
    /* prisma unavailable — still inject DNC appendix */
  }
  const parts: string[] = [];
  for (const r of rows) {
    if (!r.content.trim()) continue;
    const label = MODULE_LABELS[r.moduleKey] ?? r.moduleKey;
    parts.push(`## ${label}\n${r.content.trim()}`);
  }
  const dncFromDb = rows.some((r) => r.moduleKey === "dnc" && r.content.trim());
  if (!dncFromDb) {
    parts.push(`## Domain DNC\n${DOMAIN_DNC_PLAYBOOK_DEFAULT}`);
  }
  const text = parts.length ? parts.join("\n\n") : "";
  return NextResponse.json({ text, hasContent: !!text });
}

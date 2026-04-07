/**
 * Clone Five9 skills from templates + optional user skill migration (CSV-driven).
 * Uses Connect-style Basic auth (encodedAuth).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSkillMigrationCsv, type SkillMigrationRow } from "@/lib/skillMigrationCsv";
import {
  getSkillInfoXml,
  buildSkillInfoForCreate,
  createSkillFromSkillInfo,
  modifySkillDescription,
  getUserInfoXml,
  parseUserSkillsFromGetUserInfo,
  userSkillAdd,
  userSkillRemove,
  getUsersGeneralInfo,
  parseUserNamesFromGeneralInfo,
} from "@/lib/skillCloneFive9";
import { xmlEscape, type DC } from "@/lib/five9AdminSoap";

const RowSchema = z.object({
  source_skill_name: z.string().min(1),
  target_skill_name: z.string().min(1),
  clone: z.boolean().default(true),
  migrate_users: z.boolean().default(false),
  user_login: z.string().default(""),
  target_description: z.string().optional().default(""),
});

const BodySchema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
  csvText: z.string().optional(),
  rows: z.array(RowSchema).optional(),
  dryRun: z.boolean().default(false),
  /** Required true when migrate_users affects >20 users total */
  confirmBulkMigrate: z.boolean().optional(),
});

const MAX_AUTO_DISCOVER = 120;
const DELAY_MS = 75;

export type StepLog = {
  row: number;
  action: string;
  detail: string;
  ok: boolean;
};
type AbortCheck = () => void;

function logStep(
  steps: StepLog[],
  row: number,
  action: string,
  detail: string,
  ok: boolean,
  serverLog: boolean
) {
  steps.push({ row, action, detail, ok });
  if (serverLog) {
    console.log(
      JSON.stringify({
        skillMigration: true,
        row,
        action,
        ok,
        detail: detail.slice(0, 500),
      })
    );
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function discoverUsersWithSkill(
  encodedAuth: string,
  dc: DC,
  sourceSkill: string,
  steps: StepLog[],
  rowIdx: number,
  dryRun: boolean,
  checkAbort: AbortCheck
): Promise<string[]> {
  const patterns = ["*", "%", ""];
  for (const p of patterns) {
    checkAbort();
    const g = await getUsersGeneralInfo(encodedAuth, dc, p);
    if (!g.ok) continue;
    const allUsers = parseUserNamesFromGeneralInfo(g.xml);
    if (!allUsers.length) continue;

    const withSkill: string[] = [];
    let checked = 0;
    for (const u of allUsers) {
      checkAbort();
      if (checked >= MAX_AUTO_DISCOVER * 3) break;
      await sleep(DELAY_MS);
      const ui = await getUserInfoXml(encodedAuth, dc, u);
      checked++;
      if (!ui.ok) continue;
      const skills = parseUserSkillsFromGetUserInfo(ui.xml);
      if (skills.some((s) => s.skillName === sourceSkill)) {
        withSkill.push(u);
        if (withSkill.length >= MAX_AUTO_DISCOVER) break;
      }
    }

    if (withSkill.length) {
      logStep(
        steps,
        rowIdx,
        "discover_users",
        `Found ${withSkill.length} user(s) with skill "${sourceSkill}" (scan cap ${MAX_AUTO_DISCOVER}).`,
        true,
        true
      );
      return withSkill;
    }
  }

  logStep(
    steps,
    rowIdx,
    "discover_users",
    `Could not auto-discover users for "${sourceSkill}". Use user_login column or * with smaller domain.`,
    false,
    true
  );
  return [];
}

async function migrateOneUser(
  encodedAuth: string,
  dc: DC,
  userName: string,
  sourceSkill: string,
  targetSkill: string,
  steps: StepLog[],
  rowIdx: number,
  dryRun: boolean,
  checkAbort: AbortCheck
): Promise<boolean> {
  checkAbort();
  const ui = await getUserInfoXml(encodedAuth, dc, userName);
  if (!ui.ok) {
    logStep(steps, rowIdx, "getUserInfo", `${userName}: ${ui.fault}`, false, true);
    return false;
  }
  const refs = parseUserSkillsFromGetUserInfo(ui.xml).filter((s) => s.skillName === sourceSkill);
  if (!refs.length) {
    logStep(
      steps,
      rowIdx,
      "migrate_skip",
      `${userName} does not have skill "${sourceSkill}".`,
      true,
      true
    );
    return true;
  }

  if (dryRun) {
    logStep(
      steps,
      rowIdx,
      "migrate_preview",
      `Would remove "${sourceSkill}" from ${userName} and add "${targetSkill}".`,
      true,
      true
    );
    return true;
  }

  for (const ref of refs) {
    checkAbort();
    const rem = await userSkillRemove(encodedAuth, dc, userName, sourceSkill, ref.level, ref.id);
    if (!rem.ok) {
      logStep(steps, rowIdx, "userSkillRemove", `${userName}: ${rem.fault}`, false, true);
      return false;
    }
    await sleep(DELAY_MS);
  }

  const add = await userSkillAdd(encodedAuth, dc, userName, targetSkill, refs[0]?.level || "1");
  if (!add.ok) {
    logStep(steps, rowIdx, "userSkillAdd", `${userName}: ${add.fault}`, false, true);
    return false;
  }
  logStep(
    steps,
    rowIdx,
    "migrate_ok",
    `${userName}: ${sourceSkill} → ${targetSkill}`,
    true,
    true
  );
  return true;
}

async function processRow(
  encodedAuth: string,
  dc: DC,
  row: SkillMigrationRow,
  rowIdx: number,
  dryRun: boolean,
  steps: StepLog[],
  checkAbort: AbortCheck
): Promise<void> {
  checkAbort();
  const {
    source_skill_name: src,
    target_skill_name: tgt,
    clone,
    migrate_users,
    user_login,
    target_description,
  } = row;

  logStep(steps, rowIdx, "row_start", `source=${src} target=${tgt} clone=${clone} migrate=${migrate_users}`, true, true);

  if (clone) {
    checkAbort();
    const info = await getSkillInfoXml(encodedAuth, dc, src);
    if (!info.ok) {
      logStep(steps, rowIdx, "getSkillInfo", info.fault, false, true);
      return;
    }
    const skillInfo = buildSkillInfoForCreate(info.skillXml, tgt, target_description);
    if (dryRun) {
      logStep(
        steps,
        rowIdx,
        "clone_preview",
        `Would create skill "${tgt}" from template "${src}".`,
        true,
        true
      );
    } else {
      const created = await createSkillFromSkillInfo(encodedAuth, dc, skillInfo);
      if (!created.ok) {
        if (/already exists|SkillAlreadyExists/i.test(created.fault)) {
          logStep(
            steps,
            rowIdx,
            "createSkill",
            `Target "${tgt}" already exists — skipped create.`,
            true,
            true
          );
        } else {
          const minimal = `<skillInfo xmlns=""><skill><name>${xmlEscape(tgt)}</name><description>${xmlEscape(`Cloned from ${src}`)}</description></skill></skillInfo>`;
          const retry = await createSkillFromSkillInfo(encodedAuth, dc, minimal);
          if (!retry.ok) {
            logStep(steps, rowIdx, "createSkill", created.fault + " | fallback: " + retry.fault, false, true);
            return;
          }
          logStep(
            steps,
            rowIdx,
            "createSkill_fallback",
            `Created "${tgt}" with name+description only (full template failed).`,
            true,
            true
          );
        }
      } else {
        logStep(steps, rowIdx, "createSkill", `Created skill "${tgt}".`, true, true);
      }
    }
  }

  // Explicit target description override (single/batch scalable)
  if ((target_description || "").trim()) {
    if (dryRun) {
      logStep(
        steps,
        rowIdx,
        "modifySkill_preview",
        `Would set description on "${tgt}" to "${target_description}".`,
        true,
        true
      );
    } else {
      checkAbort();
      const mod = await modifySkillDescription(encodedAuth, dc, tgt, target_description || "");
      if (!mod.ok) {
        logStep(steps, rowIdx, "modifySkill", `${tgt}: ${mod.fault}`, false, true);
      } else {
        logStep(
          steps,
          rowIdx,
          "modifySkill",
          `Updated "${tgt}" description to "${target_description}".`,
          true,
          true
        );
      }
    }
  }

  if (!migrate_users) return;

  let users: string[] = [];
  if (user_login === "*" || user_login === "%" || user_login.toLowerCase() === "all") {
    if (dryRun) {
      logStep(
        steps,
        rowIdx,
        "discover_users_preview",
        `Would auto-discover users with "${src}" and migrate to "${tgt}" (discovery skipped in dry run).`,
        true,
        true
      );
      return;
    }
    users = await discoverUsersWithSkill(encodedAuth, dc, src, steps, rowIdx, dryRun, checkAbort);
  } else if (user_login.trim()) {
    users = [user_login.trim()];
  } else {
    logStep(
      steps,
      rowIdx,
      "migrate_skip",
      "migrate_users=Y but user_login empty — set user_login to agent id or * to auto-discover (capped).",
      true,
      true
    );
    return;
  }

  for (const u of users) {
    checkAbort();
    await migrateOneUser(encodedAuth, dc, u, src, tgt, steps, rowIdx, dryRun, checkAbort);
    await sleep(DELAY_MS);
  }
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { dataCenter, encodedAuth, dryRun, confirmBulkMigrate } = parsed.data;
  const checkAbort: AbortCheck = () => {
    if (req.signal.aborted) {
      const err = new Error("Migration cancelled: client disconnected/refreshed.");
      (err as Error & { name?: string }).name = "AbortError";
      throw err;
    }
  };
  let rows: SkillMigrationRow[] = [];
  let csvWarnings: string[] = [];

  if (parsed.data.rows?.length) {
    rows = parsed.data.rows.map((r) => ({
      source_skill_name: r.source_skill_name,
      target_skill_name: r.target_skill_name,
      clone: r.clone,
      migrate_users: r.migrate_users,
      user_login: r.user_login || "",
      target_description: r.target_description || "",
    }));
  } else if (parsed.data.csvText?.trim()) {
    const { rows: csvRows, errors } = parseSkillMigrationCsv(parsed.data.csvText);
    if (!csvRows.length) {
      return NextResponse.json({ ok: false, detail: errors.join(" ") || "No valid rows." }, { status: 400 });
    }
    rows = csvRows;
    csvWarnings = errors;
    if (errors.length) {
      console.log(JSON.stringify({ skillMigrationCsvWarnings: errors }));
    }
  } else {
    return NextResponse.json({ ok: false, detail: "Provide csvText or rows[]." }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ ok: false, detail: "No rows to process." }, { status: 400 });
  }

  const steps: StepLog[] = [];
  let bulkMigrateCount = 0;
  for (const row of rows) {
    if (!row.migrate_users) continue;
    if (row.user_login === "*" || row.user_login === "%" || row.user_login.toLowerCase() === "all") {
      bulkMigrateCount += MAX_AUTO_DISCOVER;
    } else if (row.user_login.trim()) {
      bulkMigrateCount += 1;
    }
  }

  if (bulkMigrateCount > 20 && !dryRun && !confirmBulkMigrate) {
    return NextResponse.json({
      ok: false,
      needsConfirmation: true,
      detail:
        "Large user migration detected. Run dry run first, then resubmit with confirmBulkMigrate: true after reviewing.",
      estimatedUserOps: bulkMigrateCount,
    });
  }

  try {
    for (let i = 0; i < rows.length; i++) {
      checkAbort();
      await processRow(encodedAuth, dataCenter, rows[i], i + 1, dryRun, steps, checkAbort);
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    if (aborted) {
      const summary = `Cancelled after ${steps.filter((s) => s.action === "row_start").length}/${rows.length} row(s).`;
      console.log(JSON.stringify({ skillMigrationCancelled: true, summary }));
      return NextResponse.json(
        {
          ok: false,
          cancelled: true,
          summary,
          steps,
          rowCount: rows.length,
        },
        { status: 499 }
      );
    }
    throw e;
  }

  const failCount = steps.filter((s) => !s.ok).length;
  const summary = dryRun
    ? `Dry run: ${rows.length} row(s), ${failCount} step note(s).`
    : `Executed ${rows.length} row(s). ${failCount ? failCount + " step(s) need review." : "Done."}`;

  console.log(
    JSON.stringify({
      skillMigrationSummary: summary,
      dryRun,
      rowCount: rows.length,
      stepsCount: steps.length,
    })
  );

  const hardFail = steps.some(
    (s) =>
      !s.ok &&
      ["getSkillInfo", "createSkill", "userSkillRemove", "userSkillAdd", "discover_users"].includes(s.action)
  );

  return NextResponse.json({
    ok: dryRun ? !hardFail : !hardFail,
    dryRun,
    summary,
    steps,
    rowCount: rows.length,
    csvWarnings: csvWarnings.length ? csvWarnings : undefined,
  });
}

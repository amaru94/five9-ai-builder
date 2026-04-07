/**
 * Owned CSV format for skill clone + user migration.
 * See docs/SKILL_MIGRATION_CSV.md
 */

export type SkillMigrationRow = {
  source_skill_name: string;
  target_skill_name: string;
  clone: boolean;
  migrate_users: boolean;
  /** Empty = not used; "*" = auto-discover users on source skill (capped) */
  user_login: string;
  /** Optional target description (e.g. TV Marketing) */
  target_description?: string;
};

const TRUE = new Set(["y", "yes", "true", "1", "on"]);
const FALSE = new Set(["n", "no", "false", "0", "off", ""]);

function parseBool(v: string | undefined, defaultVal: boolean): boolean {
  if (v === undefined || v === "") return defaultVal;
  const t = v.trim().toLowerCase();
  if (TRUE.has(t)) return true;
  if (FALSE.has(t)) return false;
  return defaultVal;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Map flexible headers to canonical keys */
function canonicalKey(h: string): string | null {
  const n = normHeader(h);
  if (["source_skill_name", "existing_skill", "source_skill", "from_skill", "old_skill"].includes(n)) {
    return "source_skill_name";
  }
  if (["target_skill_name", "new_skill", "target_skill", "to_skill"].includes(n)) {
    return "target_skill_name";
  }
  if (n === "clone" || n === "create_clone") return "clone";
  if (["migrate_users", "migrate", "move_users", "reassign"].includes(n)) return "migrate_users";
  if (["user_login", "user", "user_name", "username", "agent_login", "agent"].includes(n)) {
    return "user_login";
  }
  if (
    ["target_description", "new_description", "description", "desc", "skill_description"].includes(n)
  ) {
    return "target_description";
  }
  return null;
}

export function parseSkillMigrationCsv(text: string): { rows: SkillMigrationRow[]; errors: string[] } {
  const errors: string[] = [];
  const raw = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!raw.length) {
    return { rows: [], errors: ["CSV is empty."] };
  }

  const delim = raw[0].includes("\t") && !raw[0].includes(",") ? "\t" : ",";
  const headerCells = raw[0].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const colMap: Record<string, number> = {};
  headerCells.forEach((h, i) => {
    const key = canonicalKey(h);
    if (key) colMap[key] = i;
  });

  if (colMap.source_skill_name === undefined || colMap.target_skill_name === undefined) {
    errors.push(
      "Header row must include source and target skill columns, e.g. source_skill_name,target_skill_name (or existing_skill,new_skill)."
    );
    return { rows: [], errors };
  }

  const rows: SkillMigrationRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const line = raw[r];
    const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    const src = cells[colMap.source_skill_name]?.trim() || "";
    const tgt = cells[colMap.target_skill_name]?.trim() || "";
    if (!src || !tgt) {
      errors.push(`Row ${r + 1}: skipped (missing source or target skill).`);
      continue;
    }
    const clone = parseBool(colMap.clone !== undefined ? cells[colMap.clone] : undefined, true);
    const migrate_users = parseBool(
      colMap.migrate_users !== undefined ? cells[colMap.migrate_users] : undefined,
      false
    );
    const user_login =
      colMap.user_login !== undefined ? (cells[colMap.user_login]?.trim() || "") : "";
    const target_description =
      colMap.target_description !== undefined
        ? cells[colMap.target_description]?.trim() || ""
        : "";

    rows.push({
      source_skill_name: src,
      target_skill_name: tgt,
      clone,
      migrate_users,
      user_login,
      target_description,
    });
  }

  if (!rows.length && !errors.length) {
    errors.push("No data rows after header.");
  }

  return { rows, errors };
}

/**
 * Detect "clone skill X to Y" / "same users" for in-chat skill migration.
 */

export type SkillCloneIntent = {
  source_skill_name: string;
  target_skill_name: string;
  migrate_users: boolean;
  /** false = only move users; target skill must already exist */
  clone_from_template: boolean;
};

const S = "[A-Za-z][A-Za-z0-9_]{1,62}";

function wantsUserMigration(t: string): boolean {
  return /\b(same users|the same users|move users|migrate users|copy users|reassign users)\b/i.test(t);
}

export function parseSkillCloneIntent(userMessage: string): SkillCloneIntent | null {
  const t = userMessage.trim();
  if (t.length < 8) return null;

  const mMove = t.match(
    /\bmove\s+(?:users|agents)\s+from\s+([A-Za-z0-9_]+)\s+to\s+([A-Za-z0-9_]+)\b/i
  );
  if (mMove) {
    return {
      source_skill_name: mMove[1].trim(),
      target_skill_name: mMove[2].trim(),
      migrate_users: true,
      clone_from_template: false,
    };
  }

  if (t.length < 10) return null;

  const migrate = wantsUserMigration(t);
  const skillish =
    /\bskill\b/i.test(t) ||
    migrate ||
    /\b(?:create|clone|new)\b.*\bfrom\b/i.test(t) ||
    /\bexisting\b.*\bcreate\b/i.test(t);

  if (!skillish) return null;

  let source = "";
  let target = "";

  const mCreateFrom = t.match(new RegExp(`create\\s+(${S})\\s+from\\s+(${S})`, "i"));
  if (mCreateFrom) {
    target = mCreateFrom[1].trim();
    source = mCreateFrom[2].trim();
  }

  if (!source && !target) {
    const mExist = t.match(
      new RegExp(`existing\\s+(?:one\\s+)?(${S}).*?(?:want\\s+to\\s+)?create\\s+(?:a\\s+)?(?:new\\s+)?(?:skill\\s+)?(${S})`, "i")
    );
    if (mExist) {
      source = mExist[1].trim();
      target = mExist[2].trim();
    }
  }

  if (!source && !target) {
    const mClone = t.match(new RegExp(`clone\\s+(${S})\\s+(?:to|as)\\s+(${S})`, "i"));
    if (mClone) {
      source = mClone[1].trim();
      target = mClone[2].trim();
    }
  }

  if (!source || !target || source === target) return null;

  return {
    source_skill_name: source,
    target_skill_name: target,
    migrate_users: migrate,
    clone_from_template: true,
  };
}

export function parseSkillMigrationGo(text: string): boolean {
  const x = text.trim().toLowerCase();
  if (x.length > 80) return false;
  return (
    /^(go|run|apply|execute)\s+migration!?\s*$/i.test(text.trim()) ||
    /^confirm(\s+skill)?\s+migration!?\s*$/i.test(x) ||
    /^(yes,?\s*)?(run|go)\s+(it|migration)!?\s*$/i.test(x)
  );
}

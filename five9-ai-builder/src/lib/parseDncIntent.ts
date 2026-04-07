/**
 * Detect domain DNC add/remove from natural language so the builder can run /api/dnc/bulk.
 * Handles formatted numbers: (405) 778-1740, 405-778-1740, +1 405 778 1740, etc.
 */

export type DncIntent = { action: "add" | "remove"; numbers: string[] };

/** NANP 10-digit (NXX starts 2-9, NXX second digit 0-9, etc.) */
const NANP_10 = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Extract valid 10-digit US numbers from free text (digits may be split by punctuation).
 */
export function extractNanp10FromText(text: string): string[] {
  const only = text.replace(/\D/g, "");
  const found = new Set<string>();

  if (only.length === 10 && NANP_10.test(only)) {
    found.add(only);
    return [...found];
  }
  if (only.length === 11 && only.startsWith("1")) {
    const t = only.slice(1);
    if (NANP_10.test(t)) {
      found.add(t);
      return [...found];
    }
  }

  for (let i = 0; i <= only.length - 10; i++) {
    const t = only.slice(i, i + 10);
    if (NANP_10.test(t)) found.add(t);
  }
  for (let i = 0; i <= only.length - 11; i++) {
    if (only[i] === "1") {
      const t = only.slice(i + 1, i + 11);
      if (NANP_10.test(t)) found.add(t);
    }
  }
  return [...found];
}

export function parseDncIntent(userMessage: string): DncIntent | null {
  const t = userMessage.trim();
  if (!t) return null;
  if (!/\b(dnc|do\s*not\s*call)\b/i.test(t)) return null;

  const numbers = extractNanp10FromText(t);
  if (numbers.length === 0) return null;

  const lower = t.toLowerCase();
  const toDnc =
    /\b(to|onto|into)\s+(the\s+)?(domain\s+)?dnc\b/i.test(t) ||
    /\b(on|onto)\s+(the\s+)?dnc\b/i.test(t);
  const fromDnc =
    /\b(from|off)\s+(the\s+)?(domain\s+)?dnc\b/i.test(t) ||
    /\bfrom\s+dnc\b/i.test(t);

  const addWords = /\b(add|put|register|include|upload)\b/i.test(lower);
  const blockWords =
    /\b(block|blacklist)\b/i.test(lower) ||
    /\b(stop|don'?t|do not)\s+(call|dial)\b/i.test(lower);
  const remWords = /\b(remove|delete|take\s+off|scrub|delist)\b/i.test(lower);

  let action: "add" | "remove" = "remove";
  if (blockWords && !remWords) action = "add";
  else if (addWords && !remWords) action = "add";
  else if (remWords && !addWords && !blockWords) action = "remove";
  else if (toDnc && !fromDnc) action = "add";
  else if (fromDnc && !toDnc) action = "remove";
  else if (addWords && remWords) action = fromDnc ? "remove" : toDnc ? "add" : "remove";

  return { action, numbers };
}

/** User mentioned DNC but no parseable 10-digit number */
export function mentionsDncWithoutNumber(text: string): boolean {
  const t = text.trim();
  if (!/\b(dnc|do\s*not\s*call)\b/i.test(t)) return false;
  return extractNanp10FromText(t).length === 0;
}

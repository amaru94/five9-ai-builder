import { five9AdminSoap, xmlEscape, type DC } from "./five9AdminSoap";

/** Strip XML elements by local name (non-greedy single block) */
export function stripXmlElements(xml: string, tagNames: string[]): string {
  let out = xml;
  for (const tag of tagNames) {
    const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    out = out.replace(re, "");
  }
  return out;
}

/**
 * Extract <skill>...</skill> from getSkillInfo SOAP response (handles namespaces).
 */
export function extractSkillFromGetSkillInfoResponse(responseXml: string): string | null {
  const lower = responseXml.replace(/\s/g, " ");
  const skillMatch = responseXml.match(/<(?:\w+:)?skill(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?skill>/i);
  if (skillMatch) {
    return `<skill>${skillMatch[1]}</skill>`;
  }
  const infoMatch = responseXml.match(/<(?:\w+:)?skillInfo(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?skillInfo>/i);
  if (infoMatch) {
    const inner = infoMatch[1];
    const sm = inner.match(/<(?:\w+:)?skill(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?skill>/i);
    if (sm) return `<skill>${sm[1]}</skill>`;
  }
  return null;
}

export function buildSkillInfoForCreate(
  skillInnerXml: string,
  newName: string,
  targetDescription?: string
): string {
  let skill = skillInnerXml.trim();
  if (!skill.startsWith("<skill")) {
    skill = `<skill>${skill}</skill>`;
  }
  skill = skill.replace(/<(?:\w+:)?name(\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?name>/i, `<name>${xmlEscape(newName)}</name>`);
  if (typeof targetDescription === "string" && targetDescription.trim()) {
    if (/<(?:\w+:)?description(\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?description>/i.test(skill)) {
      skill = skill.replace(
        /<(?:\w+:)?description(\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?description>/i,
        `<description>${xmlEscape(targetDescription.trim())}</description>`
      );
    } else {
      skill = skill.replace(
        /<(?:\w+:)?name(\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?name>/i,
        (m) => `${m}\n<description>${xmlEscape(targetDescription.trim())}</description>`
      );
    }
  }
  skill = stripXmlElements(skill, ["id", "objectId", "uri"]);
  return `<skillInfo xmlns="">${skill}</skillInfo>`;
}

export async function getSkillInfoXml(
  encodedAuth: string,
  dc: DC,
  skillName: string
): Promise<{ ok: true; skillXml: string } | { ok: false; fault: string }> {
  const inner = `      <skillName>${xmlEscape(skillName)}</skillName>`;
  const res = await five9AdminSoap(encodedAuth, dc, "getSkillInfo", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  const skill = extractSkillFromGetSkillInfoResponse(res.xml);
  if (!skill) return { ok: false, fault: "Could not parse skill from getSkillInfo response." };
  return { ok: true, skillXml: skill };
}

export async function createSkillFromSkillInfo(
  encodedAuth: string,
  dc: DC,
  skillInfoInner: string
): Promise<{ ok: true } | { ok: false; fault: string }> {
  const inner = `      ${skillInfoInner}`;
  const res = await five9AdminSoap(encodedAuth, dc, "createSkill", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true };
}

export async function modifySkillDescription(
  encodedAuth: string,
  dc: DC,
  skillName: string,
  description: string
): Promise<{ ok: true } | { ok: false; fault: string }> {
  const inner = `      <skill xmlns="">
        <name>${xmlEscape(skillName)}</name>
        <description>${xmlEscape(description)}</description>
      </skill>`;
  const res = await five9AdminSoap(encodedAuth, dc, "modifySkill", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true };
}

export type UserSkillRef = { skillName: string; level: string; id?: string };

export function parseUserSkillsFromGetUserInfo(responseXml: string): UserSkillRef[] {
  const out: UserSkillRef[] = [];
  const re = /<(?:\w+:)?userSkill(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?userSkill>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(responseXml))) {
    const block = m[1];
    const sn = block.match(/<(?:\w+:)?skillName[^>]*>([^<]*)<\/(?:\w+:)?skillName>/i);
    const lv = block.match(/<(?:\w+:)?level[^>]*>([^<]*)<\/(?:\w+:)?level>/i);
    const id = block.match(/<(?:\w+:)?id[^>]*>([^<]*)<\/(?:\w+:)?id>/i);
    if (sn?.[1]) {
      out.push({
        skillName: sn[1].trim(),
        level: lv?.[1]?.trim() || "1",
        id: id?.[1]?.trim(),
      });
    }
  }
  return out;
}

export async function getUserInfoXml(
  encodedAuth: string,
  dc: DC,
  userName: string
): Promise<{ ok: true; xml: string } | { ok: false; fault: string }> {
  const inner = `      <userName>${xmlEscape(userName)}</userName>`;
  const res = await five9AdminSoap(encodedAuth, dc, "getUserInfo", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true, xml: res.xml };
}

export async function userSkillAdd(
  encodedAuth: string,
  dc: DC,
  userName: string,
  skillName: string,
  level: string
): Promise<{ ok: true } | { ok: false; fault: string }> {
  const inner = `      <userSkill xmlns="">
        <userName>${xmlEscape(userName)}</userName>
        <skillName>${xmlEscape(skillName)}</skillName>
        <level>${xmlEscape(level)}</level>
      </userSkill>`;
  const res = await five9AdminSoap(encodedAuth, dc, "userSkillAdd", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true };
}

export async function userSkillRemove(
  encodedAuth: string,
  dc: DC,
  userName: string,
  skillName: string,
  level: string,
  id?: string
): Promise<{ ok: true } | { ok: false; fault: string }> {
  let idXml = "";
  if (id && /^\d+$/.test(id)) {
    idXml = `\n        <id>${xmlEscape(id)}</id>`;
  }
  const inner = `      <userSkill xmlns="">
        <userName>${xmlEscape(userName)}</userName>
        <skillName>${xmlEscape(skillName)}</skillName>
        <level>${xmlEscape(level)}</level>${idXml}
      </userSkill>`;
  const res = await five9AdminSoap(encodedAuth, dc, "userSkillRemove", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true };
}

/** Usernames from getUsersGeneralInfo (best-effort parse) */
export function parseUserNamesFromGeneralInfo(responseXml: string): string[] {
  const names = new Set<string>();
  const re = /<(?:\w+:)?userName[^>]*>([^<]+)<\/(?:\w+:)?userName>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(responseXml))) {
    const u = m[1].trim();
    if (u && u.length < 256) names.add(u);
  }
  return [...names];
}

export async function getUsersGeneralInfo(
  encodedAuth: string,
  dc: DC,
  pattern: string
): Promise<{ ok: true; xml: string } | { ok: false; fault: string }> {
  const inner = `      <userNamePattern>${xmlEscape(pattern)}</userNamePattern>`;
  const res = await five9AdminSoap(encodedAuth, dc, "getUsersGeneralInfo", inner);
  if (!res.ok) return { ok: false, fault: res.fault };
  return { ok: true, xml: res.xml };
}

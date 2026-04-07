"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { mentionsDncWithoutNumber, parseDncIntent } from "@/lib/parseDncIntent";
import { parseSkillCloneIntent, parseSkillMigrationGo } from "@/lib/parseSkillCloneIntent";
import { parseSkillMigrationCsv, type SkillMigrationRow } from "@/lib/skillMigrationCsv";

type DC = "US" | "CA" | "UK" | "EU";

type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };

type CredsDraft = {
  dataCenter: DC;
  domain: string;
  username: string;
  password: string; // only held until connect
};

type SessionCreds = {
  dataCenter: DC;
  domain: string;
  username: string;
  encodedAuth: string;
};

/** Normalize for API: trim and collapse multiple spaces. */
function normalizeField(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function now() {
  return Date.now();
}

function extractXml(text: string) {
  const m = text.match(/```xml\n?([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function getTagValue(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return (m?.[1] || "").trim();
}

function validateCreateCampaignProfileXml(xml: string): string[] {
  const errs: string[] = [];
  const requiredText = ["name"];
  for (const t of requiredText) {
    if (!getTagValue(xml, t)) errs.push(`Missing required <${t}> value.`);
  }

  const requiredNumeric = ["initialCallPriority", "numberOfAttempts", "dialingTimeout", "maxCharges"];
  for (const t of requiredNumeric) {
    const v = getTagValue(xml, t);
    if (!v) {
      errs.push(`Missing required <${t}> value.`);
      continue;
    }
    if (!/^-?\d+$/.test(v)) errs.push(`<${t}> must be an integer (got "${v}").`);
  }

  const hasDialingSchedule = /<dialingSchedule(?:\s[^>]*)?>[\s\S]*?<\/dialingSchedule>/i.test(xml);
  const isDialingScheduleSelfClosed = /<dialingSchedule\s*\/>/i.test(xml);
  if (!hasDialingSchedule || isDialingScheduleSelfClosed) {
    errs.push("Missing required non-empty <dialingSchedule> block.");
  } else {
    const dsInner = xml.match(/<dialingSchedule[^>]*>([\s\S]*?)<\/dialingSchedule>/i)?.[1] || "";
    const hasNumber = /<number[^>]*>\s*[^<]+\s*<\/number>/i.test(dsInner);
    if (!hasNumber) {
      errs.push(
        "dialingSchedule appears to be missing required CampaignNumberSchedule <number> entries."
      );
    }
  }

  if (/<callPriority>/i.test(xml)) {
    errs.push("Found <callPriority>; use <initialCallPriority> for createCampaignProfile.");
  }
  if (/<callingSchedule>/i.test(xml)) {
    errs.push("Found <callingSchedule>; use <dialingSchedule> for createCampaignProfile.");
  }

  return errs;
}

function looksLikeSkillMigrationCsv(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t.includes("\n")) return false;
  const header = t.split(/\r?\n/)[0] || "";
  return (
    (header.includes("source_skill_name") && header.includes("target_skill_name")) ||
    (header.includes("existing_skill") && header.includes("new_skill"))
  );
}

function rowsToCsv(rows: SkillMigrationRow[]): string {
  const head = "source_skill_name,target_skill_name,clone,migrate_users,user_login,target_description";
  const lines = rows.map(
    (r) =>
      `${r.source_skill_name},${r.target_skill_name},${r.clone ? "Y" : "N"},${r.migrate_users ? "Y" : "N"},${r.user_login || ""},${(r.target_description || "").replace(/,/g, " ")}`
  );
  return [head, ...lines].join("\n");
}

function parseSkillMigrationLines(text: string): SkillMigrationRow[] {
  const rows: SkillMigrationRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const re = /create\s+([A-Za-z0-9_]+)\s+from\s+([A-Za-z0-9_]+)(?:.*same users)?/i;
  const reArrow = /([A-Za-z][A-Za-z0-9_]{2,})\s*(?:->|→)\s*([A-Za-z][A-Za-z0-9_]{2,})/i;
  const reTwoCols = /^\s*([A-Za-z][A-Za-z0-9_]{2,})\s+([A-Za-z][A-Za-z0-9_]{2,})(?:\s+(.+))?$/i;
  const seen = new Set<string>();
  const globalSameUsers = /same users|add the same users|copy users|migrate users/i.test(text);
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const row: SkillMigrationRow = {
        source_skill_name: m[2],
        target_skill_name: m[1],
        clone: true,
        migrate_users: /same users/i.test(line),
        user_login: /same users/i.test(line) ? "*" : "",
      };
      const key = `${row.source_skill_name}|${row.target_skill_name}|${row.migrate_users}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
      continue;
    }
    const a = line.match(reArrow);
    if (a) {
      const row: SkillMigrationRow = {
        source_skill_name: a[1],
        target_skill_name: a[2],
        clone: true,
        migrate_users: true,
        user_login: "*",
      };
      const key = `${row.source_skill_name}|${row.target_skill_name}|${row.migrate_users}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
    const tc = line.match(reTwoCols);
    if (tc) {
      const source = tc[1].trim();
      const target = tc[2].trim();
      const descRaw = (tc[3] || "").trim();
      const desc = /^(existing|new|description)$/i.test(descRaw) ? "" : descRaw;
      if (/existing\s*skill|new\s*skill|description/i.test(line)) continue;
      const row: SkillMigrationRow = {
        source_skill_name: source,
        target_skill_name: target,
        clone: true,
        migrate_users: globalSameUsers || /same users/i.test(line),
        user_login: globalSameUsers || /same users/i.test(line) ? "*" : "",
        target_description: desc || undefined,
      };
      const key = `${row.source_skill_name}|${row.target_skill_name}|${row.migrate_users}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
  }
  return rows;
}

function parseSkillMigrationBlock(text: string): SkillMigrationRow[] {
  const srcMatch = text.match(/SOURCE_SKILLS\s*:\s*([^\n\r]+)/i);
  const tgtMatch = text.match(/TARGET_SKILLS\s*:\s*([^\n\r]+)/i);
  if (!srcMatch || !tgtMatch) return [];
  const splitList = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^[A-Za-z][A-Za-z0-9_]{2,}$/.test(x));
  const src = splitList(srcMatch[1]);
  const tgt = splitList(tgtMatch[1]);
  if (!src.length || src.length !== tgt.length) return [];
  const rows: SkillMigrationRow[] = [];
  for (let i = 0; i < src.length; i++) {
    rows.push({
      source_skill_name: src[i],
      target_skill_name: tgt[i],
      clone: true,
      migrate_users: true,
      user_login: "*",
    });
  }
  return rows;
}

function parseSkillDescriptionUpdateRows(
  text: string
): Array<{ skill: string; description: string }> {
  const rows: Array<{ skill: string; description: string }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const reArrow = /^([A-Za-z][A-Za-z0-9_]{2,})\s*(?:->|→)\s*(.+)$/i;
  const reCols = /^([A-Za-z][A-Za-z0-9_]{2,})\s+(.+)$/i;

  for (const line of lines) {
    if (/existing\s*skill|new\s*skill|target\s*skill|description/i.test(line)) continue;
    const m1 = line.match(reArrow);
    const m2 = line.match(reCols);
    const skill = (m1?.[1] || m2?.[1] || "").trim();
    const desc = (m1?.[2] || m2?.[2] || "").trim();
    if (!skill || !desc) continue;
    if (/^[A-Za-z][A-Za-z0-9_]{2,}$/.test(desc)) continue; // likely another skill, not a description
    const key = `${skill}|${desc}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({ skill, description: desc });
    }
  }
  return rows;
}

function formatRowsTable(rows: SkillMigrationRow[], max = 18): string {
  const shown = rows.slice(0, max);
  const header = `| # | Source Skill | Target Skill | Users | Description |\n|---|---|---|---|---|`;
  const lines = shown.map(
    (r, i) =>
      `| ${i + 1} | ${r.source_skill_name} | ${r.target_skill_name} | ${r.migrate_users ? (r.user_login || "*") : "no"} | ${r.target_description || ""} |`
  );
  const more = rows.length > shown.length ? `\n...and ${rows.length - shown.length} more row(s).` : "";
  return `${header}\n${lines.join("\n")}${more}`;
}

function tsLabel(t: number) {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const SYSTEM_PROMPT = `You are a Five9 expert builder. MVP scope: create, update, delete, and get (extract) information from the connected Five9 domain. First testing focuses on create + get; then update + delete. Domain evaluation logic comes later.

Understand the whole ask:
- Detect intent: GET (list, show, export, fetch, what are my X) vs CREATE (add, new) vs UPDATE (change, edit, modify) vs DELETE (remove, delete). Then identify the entity: dispositions, skills, campaigns, campaign profiles, contact fields, reason codes, lists, etc.
- For GET: if they want to see/list/export dispositions, campaigns, skills, or campaign profiles, use the export tag so the app fetches and offers CSV. For other "get" requests, explain what we can export or generate a get* SOAP call if you know the operation.
- For CREATE/UPDATE/DELETE: gather required fields (see below), then output one XML block. The user will click Execute to run it against their connected domain.
- Regular users: use plain language, guide step-by-step, and clearly say what you need (Required vs Optional). It's fine to rephrase their ask: "So you want to create a callback disposition — I'll need a name and we can set it to redial with no timer."
- Experts: be concise. If they give you exact names and types, generate the payload without over-asking. Still never invent required values.

Supported operations (create, update, delete, get):
- GET (extract): Export to CSV via tags [EXPORT:dispositions], [EXPORT:campaigns], [EXPORT:skills], [EXPORT:campaignProfiles]. For single-item info you can generate getDisposition, getSkill, getCampaign, etc. XML if the user asks for one thing by name.
- CREATE: createDisposition, createSkill, createCampaignProfile, createContactField, createReasonCode, createList, createInboundCampaign, createOutboundCampaign.
- UPDATE (modify): modifyDisposition, modifySkill, modifyCampaignProfile, modifyContactField, modifyReasonCode, modifyInboundCampaign, modifyOutboundCampaign. Required: identify the existing entity (name/id) and which fields to change; send the full object or changed fields per WSDL.
- DELETE (remove): removeDisposition, removeSkill, deleteCampaignProfile, deleteContactField, deleteReasonCode, deleteReasonCodeByType, deleteList, deleteCampaign (inbound/outbound). Required: exact name (or name + type for deleteReasonCodeByType). When the user asks to delete, confirm the entity name before generating (e.g. "I'll remove the disposition named X. Confirm?") then output removeDisposition/<dispositionName> or the right delete XML.

Rules:
- Ask clarifying questions BEFORE generating payloads.
- Ask at most 3 questions per turn.
- Never assume missing details.
- When ready to generate a payload, output EXACTLY one XML block in a fenced code block: \n\n\`\`\`xml\n...\n\`\`\`\n
- After the XML, include a short checklist of what will change.

Critical vs optional (always get the critical ones):
- For every create/update, you MUST have values for all REQUIRED (critical) fields before generating XML. If the user did not provide them, ask once for the missing critical fields (e.g. "I need: name, and type for the disposition.").
- OPTIONAL fields: only include them if the user asked for something specific (e.g. "agent must confirm", "description") or you already have a value. For a minimal working payload, you may omit optional fields; the API will use defaults.
- Never invent required values (e.g. do not make up a disposition name). If a required field is missing, ask for it explicitly and list what is required vs what is optional so the user can choose.

Required vs optional by operation:

createDisposition — REQUIRED: name, type (FinalDisp|RedialNumber|DoNotDial|AddActiveNumber|AddAndFinalize|AddAllNumbers|FinalApplyToCampaigns). OPTIONAL: description, agentMustConfirm, resetAttemptsCounter, sendEmailNotification, sendIMNotification, agentMustCompleteWorksheet, trackAsFirstCallResolution, typeParameters (for RedialNumber: useTimer, attempts, timer). Minimum: name + type; for RedialNumber include typeParameters with useTimer and optionally attempts.

createSkill — REQUIRED: name. OPTIONAL: description. Minimum: <skill><name>...</name></skill> inside skillInfo.

createCampaignProfile — REQUIRED: name, initialCallPriority, numberOfAttempts, dialingTimeout, maxCharges, dialingSchedule, ANI (can be empty string). OPTIONAL: description. Minimum: name, initialCallPriority (e.g. 50), numberOfAttempts (e.g. 5), dialingTimeout (e.g. 60), maxCharges (e.g. 0), ANI (empty or omit), dialingSchedule (minimal: <dialingSchedule><dialingSchedules/><includeNumbers/></dialingSchedule>).

createContactField — REQUIRED: name, type (STRING|NUMBER|DATE|BOOLEAN|PHONE|EMAIL|etc.), displayAs (Short|Long|Invisible). OPTIONAL: restrictions, mapTo, system. Minimum: name, type, displayAs.

createReasonCode — REQUIRED: name, type (Logout or NotReady). OPTIONAL: enabled (default true), paidTime, shortcut. Minimum: name, type.

createList — REQUIRED: listName (single string). No optional fields for create.

createInboundCampaign — REQUIRED: name (and any other required by WSDL for inboundCampaign; if unsure ask). OPTIONAL: campaign-specific settings. Minimum: name.

createOutboundCampaign — REQUIRED: name (and any other required by WSDL for outboundCampaign; if unsure ask). OPTIONAL: campaign-specific settings. Minimum: name.

When the user says "create X" without details: reply with exactly what you need. Example: "To create that disposition I need: **Required:** name, type (e.g. RedialNumber or FinalDisp). **Optional:** description, agent must confirm, redial timer/attempts. What name and type do you want?"
When the user says "update X" or "change X": identify the entity (name) and what to change; for modify operations you typically send the full object with updated fields. Ask for the entity name and the new values for the fields they want to change.
When the user says "delete X" or "remove X": confirm the exact name (and type for reason codes if needed), then generate the remove/delete XML.

Scope:
- Five9 Configuration SOAP API payloads (campaigns, variables, dispositions, profiles)
- Five9 IVR scripts (generate IVR XML only when all details are known)
- **Domain DNC (add/remove numbers on the tenant domain DNC list):** The app runs these **automatically in chat** when the user mentions DNC and 10-digit numbers—do not only give Admin UI steps unless they are pasting thousands of numbers or the automatic run failed.

- **Skill clone + same users:** Do **not** say agent–skill assignments can only be done manually. Five9 supports **userSkillAdd** / **userSkillRemove**. When Connected, the user can say e.g. *"create IB_NEW from IB_OLD with the same users"* — the app runs a **dry run** then they reply **go migration** to apply (clone from template + move users). **Admin → Skill clone & user migration** accepts CSV. If the user **already created** the target skill (name+description only), they still need **go migration** to copy users from the old skill—do not tell them to click Execute on **createSkill** again (that causes "already exists"). For **full** skill config clone (not just name/description), use the Admin CSV tool or chat migration flow—not minimal createSkill XML alone.

When the user asks to get all or export as CSV any of: dispositions, campaigns, skills, campaign profiles (or "all settings"):
- Reply with a short friendly message (e.g. "I'll fetch that for you.") and on a new line output exactly one of these tags so the app can run the export: [EXPORT:dispositions] or [EXPORT:campaigns] or [EXPORT:skills] or [EXPORT:campaignProfiles]. Use the tag that matches what they asked for. Do not say you cannot generate files.

Five9 SOAP format (strict — follow exactly):
- Endpoint uses AdminWebService v11_5; namespace for the operation is http://service.admin.ws.five9.com/v11_5/
- Envelope: use soapenv and one prefix (e.g. ser) for the service namespace. The single parameter element (e.g. the disposition object) must be in EMPTY namespace: use <disposition xmlns="">...</disposition> so its child elements have no namespace. Do NOT use ser:name, ser:type, etc. inside disposition.
- createDisposition: the <disposition> element must have xmlns="" and its children must be unqualified (no prefix). Allowed child elements: name, description, type, agentMustConfirm, resetAttemptsCounter, sendEmailNotification, sendIMNotification, agentMustCompleteWorksheet, trackAsFirstCallResolution, typeParameters. Do NOT use resetTime (invalid). Use typeParameters for redial options.
- Disposition type values: FinalDisp, FinalApplyToCampaigns, AddActiveNumber, AddAndFinalize, AddAllNumbers, DoNotDial, RedialNumber.
- For RedialNumber with no timer: use <typeParameters><useTimer>false</useTimer><attempts>99</attempts></typeParameters> inside disposition (attempts optional but some tenants require it). For redial with a timer use useTimer true and timer (days/hours/minutes/seconds) and attempts.
- Booleans: use true/false lowercase.
- The app tries API versions v11_5, v9_5, and v2 automatically. If you get "Fault occurred while processing", the disposition name may already exist (try a different name) or the tenant may have restrictions.

createCampaignProfile (strict — wrong names cause Unmarshalling Error):
- Use <campaignProfile xmlns=""> with UNQUALIFIED child elements (no ser: prefix inside).
- Required/expected top-level elements: name, description, initialCallPriority (not callPriority), numberOfAttempts, dialingTimeout, maxCharges, dialingSchedule (not callingSchedule), ANI (optional string).
 - dialingSchedule is one object of type campaignDialingSchedule.
   Important: Five9 tenants can require CampaignNumberSchedule.number inside dialingSchedule. Do NOT generate an empty <dialingSchedule/> (or a block that omits required number entries).
   If the user says the intent is "copy/clone from an existing campaign profile", you MUST copy the dialingSchedule structure from the source profile (via getCampaignProfile) and only change the top-level fields (e.g. name, optionally description/ANI) requested by the user.
   If the user did not provide dialingSchedule/number-schedule details for a new profile, ask for the needed numbers/schedule instead of using a minimal placeholder.
 - Do NOT use callPriority, callingSchedule, scheduleEntry, startHour, endHour, days, asapRecordsTimeout, asapRecordsOrder, asapRecordsAttempts, dispositionFolders in createCampaignProfile (those are wrong or from another API). Refer to Five9 WSDL for full campaignDialingSchedule structure (dialingSchedules list, includeNumbers, dialASAPSortOrder, etc.).

createSkill: use <skillInfo xmlns=""><skill><name>...</name><description>...</description></skill></skillInfo>. createContactField: use <field xmlns=""> with name, type (e.g. STRING), displayAs (e.g. Short). createReasonCode: use <reasonCode xmlns=""> with name, type (Logout or NotReady), enabled (true/false). createList: single string parameter listName. createInboundCampaign / createOutboundCampaign: use campaign object with name and required fields per WSDL.
modifySkill: use <skill xmlns=""><name>...</name><description>...</description></skill> inside <ser:modifySkill>. Do NOT send <skillInfo> for modifySkill.

Example createDisposition (agent-confirmed, redialable, no timer, with description):
\`\`\`xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.admin.ws.five9.com/v11_5/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:createDisposition>
      <disposition xmlns="">
        <name>TESTERX</name>
        <description>this is an api test</description>
        <type>RedialNumber</type>
        <agentMustConfirm>true</agentMustConfirm>
        <typeParameters>
          <useTimer>false</useTimer>
          <attempts>99</attempts>
        </typeParameters>
      </disposition>
    </ser:createDisposition>
  </soapenv:Body>
</soapenv:Envelope>
\`\`\`

Style:
- Use naming patterns: CCRD-* for main IVRs, CCRD-FS_* for foreign scripts.
- Prefer modular design: foreign scripts for language selection, HOOPS/callback, emergency.
- When asking for missing info, always separate "Required" vs "Optional" so the user knows the minimum they must provide.

Playbook (when provided): The app may inject a playbook with per-module scenarios (Dispositions, Campaigns, Skills, Lists, Variables, Not ready codes, IVRs, Campaign profiles, Reports, Contact fields). When the user asks for something that matches or resembles a playbook scenario, offer to **build exactly like this** (from the playbook) and always give the user the option to do that or customize. Example: "I have a playbook for this: [brief summary]. I can build exactly like that, or we can customize. Which do you prefer?"
`;

export default function Five9Builder({ workspaceId }: { workspaceId: string }) {
  const [draft, setDraft] = useState<CredsDraft>({ dataCenter: "US", domain: "", username: "", password: "" });
  const [sessionCreds, setSessionCreds] = useState<SessionCreds | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [playbookText, setPlaybookText] = useState("");

  useEffect(() => {
    fetch("/api/playbook")
      .then((r) => r.json())
      .then((d) => setPlaybookText(d?.text ?? ""))
      .catch(() => {});
  }, []);

  const systemPromptWithPlaybook = useMemo(() => {
    const trimmed = playbookText.trim();
    if (!trimmed) return SYSTEM_PROMPT;
    return (
      SYSTEM_PROMPT +
      "\n\n---\n**Playbook (how we approach each module — follow these scenarios and offer to build exactly like this when relevant):**\n" +
      trimmed
    );
  }, [playbookText]);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Click **Connect** and enter your Five9 username and password (session only). Then tell me what you want to do: **get** information (list/export dispositions, campaigns, skills, profiles), **create** something new, **update** an existing item, or **delete** one. I'll guide you through what I need and generate the right payload.",
      ts: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [exportData, setExportData] = useState<{ entityType: string; rows: Record<string, string>[] } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [dncLoading, setDncLoading] = useState(false);
  const [skillMigrateLoading, setSkillMigrateLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    active: boolean;
    total: number;
    done: number;
    current: string;
  }>({ active: false, total: 0, done: 0, current: "" });
  const [opStatus, setOpStatus] = useState<{
    phase: "idle" | "running" | "done" | "error";
    label: string;
    detail?: string;
    progressPct?: number;
  }>({ phase: "idle", label: "" });
  const [opHistory, setOpHistory] = useState<
    Array<{
      ts: number;
      phase: "done" | "error";
      label: string;
      detail?: string;
    }>
  >([]);
  const opDoneTimerRef = useRef<number | null>(null);
  const pendingSkillMigrationRef = useRef<{
    source: string;
    target: string;
    migrate_users: boolean;
    clone_from_template: boolean;
  } | null>(null);
  const pendingSkillBatchRef = useRef<{
    rows: SkillMigrationRow[];
  } | null>(null);

  type EntityType = "dispositions" | "campaigns" | "skills" | "campaignProfiles";
  const EXPORT_MARKER = /\[EXPORT:(dispositions|campaigns|skills|campaignProfiles)\]/i;

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return messages[i].content;
    return "";
  }, [messages]);

  const latestXml = useMemo(() => extractXml(latestAssistant), [latestAssistant]);

  function beginOp(label: string, detail?: string, progressPct?: number) {
    if (opDoneTimerRef.current) {
      window.clearTimeout(opDoneTimerRef.current);
      opDoneTimerRef.current = null;
    }
    setOpStatus({ phase: "running", label, detail, progressPct });
  }

  function addOpHistory(entry: {
    ts: number;
    phase: "done" | "error";
    label: string;
    detail?: string;
  }) {
    setOpHistory((prev) => [entry, ...prev].slice(0, 5));
  }

  function finishOpOk(label: string, detail?: string) {
    setOpStatus({ phase: "done", label, detail, progressPct: 100 });
    addOpHistory({ ts: now(), phase: "done", label, detail });
    opDoneTimerRef.current = window.setTimeout(() => {
      setOpStatus({ phase: "idle", label: "" });
      opDoneTimerRef.current = null;
    }, 2200);
  }

  function finishOpErr(label: string, detail?: string) {
    setOpStatus({ phase: "error", label, detail });
    addOpHistory({ ts: now(), phase: "error", label, detail });
    opDoneTimerRef.current = window.setTimeout(() => {
      setOpStatus({ phase: "idle", label: "" });
      opDoneTimerRef.current = null;
    }, 3500);
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");

    if (mentionsDncWithoutNumber(text)) {
      setMessages((m) => [
        ...m,
        { role: "user", content: text, ts: now() },
        {
          role: "assistant",
          content:
            "I can run domain DNC from chat, but I need a **10-digit US number**. Examples: `(405) 778-1740`, `405-778-1740`, or `4057781740`. Paste the number and send again.",
          ts: now(),
        },
      ]);
      return;
    }

    const pendingM = pendingSkillMigrationRef.current;
    const pendingBatch = pendingSkillBatchRef.current;
    const wantsBatchExecute =
      sessionCreds?.encodedAuth &&
      pendingBatch &&
      (/^(authorize|approve|confirm)\s+batch!?$/i.test(text.trim()) ||
        /^(run|execute)\s+(all|batch)!?$/i.test(text.trim()) ||
        /^go\s+batch!?$/i.test(text.trim()));
    if (wantsBatchExecute && pendingBatch) {
      beginOp("Batch migration", "Executing rows...");
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      setSkillMigrateLoading(true);
      setBatchProgress({ active: true, total: pendingBatch.rows.length, done: 0, current: "Starting..." });
      try {
        let failed = 0;
        for (let i = 0; i < pendingBatch.rows.length; i++) {
          const row = pendingBatch.rows[i];
          setBatchProgress({
            active: true,
            total: pendingBatch.rows.length,
            done: i,
            current: `${row.source_skill_name} → ${row.target_skill_name}`,
          });
          setOpStatus({
            phase: "running",
            label: "Batch migration",
            detail: `Row ${i + 1}/${pendingBatch.rows.length}: ${row.source_skill_name} → ${row.target_skill_name}`,
            progressPct: Math.round((i / Math.max(1, pendingBatch.rows.length)) * 100),
          });
          const oneRes = await fetch("/api/five9/skills/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataCenter: sessionCreds.dataCenter,
              encodedAuth: sessionCreds.encodedAuth,
              rows: [row],
              dryRun: false,
              confirmBulkMigrate: true,
            }),
          });
          const one = await oneRes.json().catch(() => ({}));
          const okOne = !!one.ok;
          if (!okOne) failed++;
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `${okOne ? "✅" : "⚠️"} Row ${i + 1}/${pendingBatch.rows.length}: ${row.source_skill_name} → ${row.target_skill_name}${okOne ? "" : `\n${one.summary || one.detail || "Row failed"}`}`,
              ts: now(),
            },
          ]);
          if (i === 0 && !okOne) {
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: "Batch stopped after canary failure on row 1.",
                ts: now(),
              },
            ]);
            break;
          }
        }

        pendingSkillBatchRef.current = null;
        setBatchProgress({
          active: false,
          total: pendingBatch.rows.length,
          done: pendingBatch.rows.length,
          current: "Completed",
        });
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `✅ Batch execution finished.\n\n` +
              `Total rows: ${pendingBatch.rows.length}\nFailed rows: ${failed}\nPassed rows: ${Math.max(0, pendingBatch.rows.length - failed)}\n\n` +
              `\n\n_Full details: **Admin → Skill clone & user migration**._`,
            ts: now(),
          },
        ]);
        finishOpOk("Batch migration", `Processed ${pendingBatch.rows.length} row(s).`);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Batch execution failed: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Batch migration", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
        setBatchProgress((p) => ({ ...p, active: false }));
      }
      return;
    }

    const descRows = parseSkillDescriptionUpdateRows(text);
    const isBulkDescIntent =
      /\b(update|set|change|modify)\b/i.test(text) &&
      /\b(description|desc)\b/i.test(text) &&
      descRows.length >= 1;
    if (isBulkDescIntent) {
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      if (!sessionCreds?.encodedAuth) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Parsed ${descRows.length} description update row(s). Connect to Five9 first, then send again.`,
            ts: now(),
          },
        ]);
        return;
      }
      beginOp("Bulk description update", `Preparing ${descRows.length} row(s)...`);
      setSkillMigrateLoading(true);
      try {
        const rows: SkillMigrationRow[] = descRows.map((r) => ({
          source_skill_name: r.skill,
          target_skill_name: r.skill,
          clone: false,
          migrate_users: false,
          user_login: "",
          target_description: r.description,
        }));
        const previewRes = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataCenter: sessionCreds.dataCenter,
            encodedAuth: sessionCreds.encodedAuth,
            rows,
            dryRun: true,
          }),
        });
        const preview = await previewRes.json().catch(() => ({}));
        pendingSkillBatchRef.current = { rows };
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `**Bulk description update dry-run ready** (${rows.length} skill(s)).\n\n` +
              `${preview.summary || ""}\n\n` +
              `${formatRowsTable(rows, 20)}\n\n` +
              `Reply **authorize batch** to apply all description updates.`,
            ts: now(),
          },
        ]);
        finishOpOk("Bulk description update", `${rows.length} row(s) ready.`);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Bulk description dry-run failed: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Bulk description update", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
      }
      return;
    }

    const lineRows = parseSkillMigrationLines(text);
    const blockRows = parseSkillMigrationBlock(text);
    const mergedRows = [...lineRows, ...blockRows];
    const uniq = new Map<string, SkillMigrationRow>();
    for (const r of mergedRows) uniq.set(`${r.source_skill_name}|${r.target_skill_name}`, r);
    const autoRows = [...uniq.values()];
    const hasLineBatch = autoRows.length >= 2;
    if (looksLikeSkillMigrationCsv(text) || hasLineBatch) {
      beginOp("Batch dry run", "Parsing and validating rows...");
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      const parsedCsv = looksLikeSkillMigrationCsv(text)
        ? parseSkillMigrationCsv(text)
        : { rows: autoRows, errors: [] as string[] };
      if (!parsedCsv.rows.length) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `⚠️ Could not parse CSV rows.\n\n${parsedCsv.errors.join("\n")}\n\nExpected header: source_skill_name,target_skill_name,clone,migrate_users,user_login`,
            ts: now(),
          },
        ]);
        finishOpErr("Batch dry run", "CSV/list parsing failed.");
        return;
      }
      if (!sessionCreds?.encodedAuth) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `Parsed ${parsedCsv.rows.length} row(s). Connect to Five9, then paste again to run dry-run and batch authorization.`,
            ts: now(),
          },
        ]);
        finishOpErr("Batch dry run", "Connect to Five9 first.");
        return;
      }

      setSkillMigrateLoading(true);
      try {
        const previewRes = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataCenter: sessionCreds.dataCenter,
            encodedAuth: sessionCreds.encodedAuth,
            csvText: rowsToCsv(parsedCsv.rows),
            dryRun: true,
            confirmBulkMigrate: false,
          }),
        });
        const preview = await previewRes.json().catch(() => ({}));
        pendingSkillBatchRef.current = { rows: parsedCsv.rows };
        const lines = (preview.steps || [])
          .slice(0, 12)
          .map(
            (s: { action: string; ok: boolean; detail: string }) =>
              `${s.ok ? "✓" : "✗"} ${s.action}: ${String(s.detail).slice(0, 100)}`
          );
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `**Batch dry-run ready** for ${parsedCsv.rows.length} row(s).\n\n` +
              `${preview.summary || ""}` +
              `\n\n${formatRowsTable(parsedCsv.rows)}` +
              (parsedCsv.errors.length ? `\n\nCSV warnings:\n- ${parsedCsv.errors.join("\n- ")}` : "") +
              (lines.length ? `\n\n${lines.join("\n")}` : "") +
              `\n\nReply **authorize batch** to run row 1 first, then auto-run the remaining rows.`,
            ts: now(),
          },
        ]);
        finishOpOk("Batch dry run", `${parsedCsv.rows.length} row(s) ready for authorization.`);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `CSV dry-run failed: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Batch dry run", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
      }
      return;
    }

    const wantsMigrateExecute =
      sessionCreds?.encodedAuth &&
      pendingM &&
      (parseSkillMigrationGo(text) || /^(yes|ok)\.?$/i.test(text.trim()));
    if (wantsMigrateExecute && pendingM) {
      beginOp("Skill migration", `${pendingM.source} → ${pendingM.target}`);
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      setSkillMigrateLoading(true);
      try {
        const c = pendingM.clone_from_template ? "Y" : "N";
        const csvText = `source_skill_name,target_skill_name,clone,migrate_users,user_login
${pendingM.source},${pendingM.target},${c},${pendingM.migrate_users ? "Y" : "N"},${pendingM.migrate_users ? "*" : ""}`;
        const res = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataCenter: sessionCreds.dataCenter,
            encodedAuth: sessionCreds.encodedAuth,
            csvText,
            dryRun: false,
            confirmBulkMigrate: pendingM.migrate_users ? true : false,
          }),
        });
        let data = await res.json().catch(() => ({}));
        if (data.needsConfirmation && pendingM.migrate_users) {
          const res2 = await fetch("/api/five9/skills/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataCenter: sessionCreds.dataCenter,
              encodedAuth: sessionCreds.encodedAuth,
              csvText,
              dryRun: false,
              confirmBulkMigrate: true,
            }),
          });
          data = await res2.json().catch(() => ({}));
        }
        pendingSkillMigrationRef.current = null;
        if (data.needsConfirmation) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                `**Skill migration needs confirmation.** ${data.detail}\n\nUse **Admin → Skill clone & user migration**, run dry run, then execute with bulk confirm checked.`,
              ts: now(),
            },
          ]);
          pendingSkillMigrationRef.current = pendingM;
          return;
        }
        const ok = data.ok === true;
        const lines = (data.steps || [])
          .slice(-12)
          .map(
            (s: { action: string; ok: boolean; detail: string }) =>
              `${s.ok ? "✓" : "✗"} ${s.action}: ${String(s.detail).slice(0, 120)}`
          );
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              (ok ? "✅ **Skill migration finished.**\n\n" : "⚠️ **Skill migration completed with issues.**\n\n") +
              (data.summary || "") +
              (lines.length ? `\n\n${lines.join("\n")}` : "") +
              `\n\n_Full steps: **Admin → Skill clone & user migration**._`,
            ts: now(),
          },
        ]);
        finishOpOk("Skill migration", `${pendingM.source} → ${pendingM.target}`);
      } catch (e) {
        pendingSkillMigrationRef.current = pendingM;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Skill migration failed: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Skill migration", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
      }
      return;
    }

    const skillCloneIntent = parseSkillCloneIntent(text);
    if (skillCloneIntent && sessionCreds?.encodedAuth) {
      beginOp("Skill clone", `${skillCloneIntent.source_skill_name} → ${skillCloneIntent.target_skill_name}`);
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      setSkillMigrateLoading(true);
      try {
        const {
          source_skill_name: src,
          target_skill_name: tgt,
          migrate_users: mig,
          clone_from_template: cft,
        } = skillCloneIntent;
        const csvText = `source_skill_name,target_skill_name,clone,migrate_users,user_login
${src},${tgt},${cft ? "Y" : "N"},${mig ? "Y" : "N"},${mig ? "*" : ""}`;
        const res = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataCenter: sessionCreds.dataCenter,
            encodedAuth: sessionCreds.encodedAuth,
            csvText,
            dryRun: mig,
            confirmBulkMigrate: false,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (mig) {
          pendingSkillMigrationRef.current = {
            source: src,
            target: tgt,
            migrate_users: true,
            clone_from_template: cft,
          };
          const lines = (data.steps || [])
            .slice(0, 10)
            .map(
              (s: { action: string; ok: boolean; detail: string }) =>
                `${s.ok ? "✓" : "✗"} ${s.action}: ${String(s.detail).slice(0, 100)}`
            );
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                `**Preview:** clone **${src}** → **${tgt}** and move users (where found).\n\n` +
                (data.summary || "") +
                (lines.length ? `\n\n${lines.join("\n")}` : "") +
                `\n\nReply **go migration** to apply. (Target skill may already exist — users will still be moved.)`,
              ts: now(),
            },
          ]);
          finishOpOk("Skill clone preview", `${src} → ${tgt}`);
        } else {
          pendingSkillMigrationRef.current = null;
          const ok2 = data.ok === true;
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                (ok2
                  ? `✅ Created skill **${tgt}** from **${src}** (or it already existed).`
                  : `⚠️ ${data.summary || data.detail || "Clone failed"}`) +
                `\n\n_To copy **users** from **${src}** onto **${tgt}**, say: **move users from ${src} to ${tgt}** then **go migration**._`,
              ts: now(),
            },
          ]);
          finishOpOk("Skill clone", `${src} → ${tgt}`);
        }
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Skill clone request failed: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Skill clone", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
      }
      return;
    }

    if (skillCloneIntent && !sessionCreds?.encodedAuth) {
      setMessages((m) => [
        ...m,
        { role: "user", content: text, ts: now() },
        {
          role: "assistant",
          content:
            `**Connect** to Five9 first, then ask again to clone **${skillCloneIntent.source_skill_name}** → **${skillCloneIntent.target_skill_name}**` +
            (skillCloneIntent.migrate_users ? " **with the same users**." : "."),
          ts: now(),
        },
      ]);
      return;
    }

    const dncIntent = parseDncIntent(text);
    if (dncIntent && dncIntent.numbers.length > 0) {
      beginOp("Domain DNC", `${dncIntent.action} ${dncIntent.numbers.length} number(s)`);
      setMessages((m) => [...m, { role: "user", content: text, ts: now() }]);
      // Voice DNC recovery: checkDnc → removeNumbersFromDnc only if on DNC → check again (no list/contact deletes).
      if (dncIntent.action === "remove") {
        if (!sessionCreds?.encodedAuth) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "**Connect** first, then ask again to run **voice DNC recovery** (remove from domain call DNC only).",
              ts: now(),
            },
          ]);
          return;
        }
        setDncLoading(true);
        try {
          const res = await fetch("/api/five9/dnc-voice-recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataCenter: sessionCreds.dataCenter,
              encodedAuth: sessionCreds.encodedAuth,
              numbers: dncIntent.numbers,
            }),
          });
          const data = await res.json().catch(() => ({}));
          const reply =
            (typeof data.message === "string" && data.message.trim()) ||
            (typeof data.detail === "string" ? data.detail : "Request completed.");
          setMessages((m) => [
            ...m,
            { role: "assistant", content: reply, ts: now() },
          ]);
          finishOpOk("Voice DNC recovery");
        } catch (e) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Voice DNC recovery failed: ${e instanceof Error ? e.message : String(e)}`,
              ts: now(),
            },
          ]);
          finishOpErr("Voice DNC recovery", e instanceof Error ? e.message : String(e));
        } finally {
          setDncLoading(false);
        }
        return;
      }

      setDncLoading(true);
      try {
        const payload: Record<string, unknown> = {
          action: dncIntent.action,
          numbers: dncIntent.numbers,
        };
        const useDirectFive9 = !!sessionCreds?.encodedAuth;
        const res = useDirectFive9
          ? await fetch("/api/five9/dnc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                dataCenter: sessionCreds.dataCenter,
                encodedAuth: sessionCreds.encodedAuth,
                action: dncIntent.action,
                numbers: dncIntent.numbers,
              }),
            })
          : await fetch("/api/dnc/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
        const data = await res.json().catch(() => ({}));
        let reply: string;
        if (res.ok && data?.ok) {
          const nums = dncIntent.numbers.join(", ");
          if (data.simulated) {
            reply =
              "⚠️ **Simulation only** — Five9 was not updated. Connect and try again, or configure the skill engine for real SOAP.";
          } else if (data.queued) {
            reply = `⏳ **Queued for after-hours** — domain DNC add for ${nums} will run 11 PM–6 AM Pacific. Job: \`${data.job_id || "n/a"}\``;
          } else {
            reply = `✅ **Added to domain call DNC:** ${nums}.`;
          }
          if (Array.isArray(data.invalid_samples) && data.invalid_samples.length) {
            reply += ` (Some inputs skipped: ${data.invalid_samples.slice(0, 3).join(", ")}.)`;
          }
        } else {
          const err =
            typeof data?.detail === "string"
              ? data.detail
              : data?.error || data?.message || res.statusText || "Request failed";
          reply = `⚠️ **Domain DNC request failed**\n\n${err}\n\n_Check SKILL_ENGINE_URL / Five9 credentials / DNC API key._`;
        }
        setMessages((m) => [...m, { role: "assistant", content: reply, ts: now() }]);
        if (res.ok && data?.ok) finishOpOk("Domain DNC");
        else finishOpErr("Domain DNC", typeof data?.detail === "string" ? data.detail : "Request failed");
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `⚠️ Could not reach DNC API: ${e instanceof Error ? e.message : "Unknown error"}`,
            ts: now(),
          },
        ]);
        finishOpErr("Domain DNC", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setDncLoading(false);
      }
      return;
    }

    beginOp("Assistant request", "Generating response...");
    const nextMsgs: ChatMsg[] = [...messages, { role: "user", content: text, ts: now() }];
    setMessages(nextMsgs);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system: systemPromptWithPlaybook,
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json().catch(() => ({}));
    let reply = data?.text || "(No response text returned.)";

    // If the model produced a long mapping list, convert it to structured batch mode.
    const replyRows = [
      ...parseSkillMigrationLines(reply),
      ...parseSkillMigrationBlock(reply),
    ];
    const looksLikeLongSkillList = replyRows.length >= 4 && reply.length > 700;
    if (looksLikeLongSkillList) {
      if (!sessionCreds?.encodedAuth) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `I parsed ${replyRows.length} skill mapping row(s) from that plan.\n\n` +
              `${formatRowsTable(replyRows, 12)}\n\n` +
              `Connect first, then paste this list again (or CSV) and I'll run dry-run + batch authorization automatically.`,
            ts: now(),
          },
        ]);
        return;
      }

      setSkillMigrateLoading(true);
      try {
        const previewRes = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataCenter: sessionCreds.dataCenter,
            encodedAuth: sessionCreds.encodedAuth,
            rows: replyRows,
            dryRun: true,
            confirmBulkMigrate: false,
          }),
        });
        const preview = await previewRes.json().catch(() => ({}));
        pendingSkillBatchRef.current = { rows: replyRows };
        const lines = (preview.steps || [])
          .slice(0, 12)
          .map(
            (s: { action: string; ok: boolean; detail: string }) =>
              `${s.ok ? "✓" : "✗"} ${s.action}: ${String(s.detail).slice(0, 100)}`
          );
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `**Converted long text into batch mode** (${replyRows.length} rows).\n\n` +
              `${preview.summary || ""}\n\n` +
              `${formatRowsTable(replyRows)}\n\n` +
              (lines.length ? `${lines.join("\n")}\n\n` : "") +
              `Reply **authorize batch** to execute.`,
            ts: now(),
          },
        ]);
        finishOpOk("Batch conversion", `${replyRows.length} row(s) ready.`);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Could not convert long text to batch run: ${e instanceof Error ? e.message : String(e)}`,
            ts: now(),
          },
        ]);
        finishOpErr("Batch conversion", e instanceof Error ? e.message : String(e));
      } finally {
        setSkillMigrateLoading(false);
      }
      return;
    }

    setMessages((m) => [...m, { role: "assistant", content: reply, ts: now() }]);
    finishOpOk("Assistant response");

    const exportMatch = reply.match(EXPORT_MARKER);
    if (exportMatch) {
      const entityType = exportMatch[1].toLowerCase() as EntityType;
      const cleaned = reply.replace(EXPORT_MARKER, "").trim() || "Preparing your export…";
      setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], content: cleaned }]);
      if (sessionCreds) fetchExportData(entityType);
      else setMessages((m) => [...m, { role: "assistant", content: "⚠️ Connect to Five9 first (click **Connect**), then ask again to export.", ts: now() }]);
    }
  }

  async function runApiTest() {
    if (!sessionCreds) {
      alert("Connect to Five9 first.");
      return;
    }
    beginOp("API test", "Running test suite...");
    setTestLoading(true);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    try {
      const res = await fetch("/api/five9/test-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dataCenter: sessionCreds.dataCenter,
          encodedAuth: sessionCreds.encodedAuth,
        }),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));
      const summary = data?.summary ?? (res.ok ? "Done" : "Test failed");
      const lines = (data?.results ?? []).map((r: { step: string; ok: boolean; fault?: string }) =>
        r.ok ? `✅ ${r.step}` : `❌ ${r.step}${r.fault ? ": " + r.fault : ""}`
      );
      const errNote =
        !res.ok && !lines.length ? `\n\n${data?.error || data?.message || res.statusText}` : "";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `**API test (Ai_TESTERX):** ${summary}\n\n${lines.length ? lines.join("\n") : "(no step results)"}${errNote}`,
          ts: now(),
        },
      ]);
      finishOpOk("API test", summary);
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: aborted
            ? "**API test timed out** (2 min). Five9 can be slow — try again, or check your network."
            : `**API test error:** ${e instanceof Error ? e.message : String(e)}`,
          ts: now(),
        },
      ]);
      finishOpErr("API test", e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
      setTestLoading(false);
    }
  }

  async function executeXml() {
    if (!latestXml) return;
    if (!sessionCreds) {
      alert("Connect to Five9 first.");
      return;
    }

    // Safety check: Five9 can require CampaignNumberSchedule.number inside dialingSchedule.
    // Your error was: "CampaignNumberSchedule.number is required, but is 'null'".
    const isCreateCampaignProfile = /<[^:>]*:?\s*createCampaignProfile\b/i.test(latestXml);
    if (isCreateCampaignProfile) {
      const errs = validateCreateCampaignProfileXml(latestXml);
      if (errs.length) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "⚠️ `createCampaignProfile` preflight validation failed:\n\n" +
              errs.map((e) => `- ${e}`).join("\n") +
              "\n\nPlease regenerate by cloning the source profile schedule (including number entries), then Execute again.",
            ts: now(),
          },
        ]);
        return;
      }
    }

    const isModifySkill = /<[^:>]*:?\s*modifySkill\b/i.test(latestXml);
    if (isModifySkill) {
      const hasSkillInfo = /<skillInfo\b/i.test(latestXml);
      const hasSkill = /<skill\b/i.test(latestXml);
      if (hasSkillInfo || !hasSkill) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "⚠️ `modifySkill` preflight validation failed.\n\nUse `<skill xmlns=\"\">...</skill>` inside `modifySkill`, not `<skillInfo>`. Example fields: `<name>...</name>` and `<description>...</description>`.",
            ts: now(),
          },
        ]);
        return;
      }
    }

    beginOp("Execute SOAP/XML", "Calling Five9...");
    const title = "Execute SOAP/XML";

    // Log intent
    await fetch("/api/changes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, title, payloadXml: latestXml, ok: false }),
    }).catch(() => {});

    const res = await fetch("/api/five9/soap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataCenter: sessionCreds.dataCenter,
        username: sessionCreds.username,
        encodedAuth: sessionCreds.encodedAuth,
        xml: latestXml,
      }),
    });

    const responseText = await res.text();
    const isSoapFault = /<fault|:Fault|Fault occurred|faultstring/i.test(responseText);
    const ok = res.ok && !isSoapFault;
    const faultSummary =
      responseText.match(/<message[^>]*>([\s\S]*?)<\/message>/i)?.[1]?.trim() ||
      responseText.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim() ||
      "";

    await fetch("/api/changes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title,
        payloadXml: latestXml,
        response: responseText,
        ok,
      }),
    }).catch(() => {});

    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content:
          (ok
            ? "✅ Five9 API call executed successfully."
            : `⚠️ Five9 API call failed.${faultSummary ? `\n\nReason: ${faultSummary}` : ""}`) +
          "\n\n" +
          "```xml\n" +
          responseText.slice(0, 12000) +
          "\n```",
        ts: now(),
      },
    ]);
    if (ok) finishOpOk("Execute SOAP/XML");
    else finishOpErr("Execute SOAP/XML", faultSummary || "Five9 fault");
  }

  async function fetchExportData(entityType: EntityType) {
    if (!sessionCreds) return;
    beginOp("Export fetch", `Fetching ${entityType}...`);
    setExportLoading(true);
    setExportData(null);
    try {
      const res = await fetch("/api/five9/entities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dataCenter: sessionCreds.dataCenter,
          encodedAuth: sessionCreds.encodedAuth,
          entityType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.message || data?.error || data?.details || res.statusText;
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `⚠️ Failed to fetch ${entityType}: ${msg}`, ts: now() },
        ]);
        finishOpErr("Export fetch", String(msg));
        return;
      }
      const rows = data?.entities || [];
      setExportData({ entityType, rows });
      const label = { dispositions: "disposition(s)", campaigns: "campaign(s)", skills: "skill(s)", campaignProfiles: "campaign profile(s)" }[entityType];
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `✅ Fetched **${rows.length}** ${label} from Five9. Click **Download CSV** above to save the file.`,
          ts: now(),
        },
      ]);
      finishOpOk("Export fetch", `${rows.length} ${entityType} row(s)`);
    } finally {
      setExportLoading(false);
    }
  }

  function downloadExportCsv() {
    if (!exportData || exportData.rows.length === 0) return;
    const filename = `five9-${exportData.entityType}.csv`;
    fetch("/api/five9/export-csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: exportData.rows, filename }),
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Builder Console</div>
          <span
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #334155",
              background: sessionCreds ? "#071a10" : "#120a0a",
              color: sessionCreds ? "#6de28a" : "#f08e8e",
            }}
          >
            {sessionCreds ? `Connected (${sessionCreds.dataCenter})${sessionCreds.domain ? ` · ${sessionCreds.domain}` : ""}` : "Not connected"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btnGhost} onClick={() => setConnectOpen((v) => !v)} disabled={connectLoading}>
            {connectOpen ? "Close" : "Connect"}
          </button>
          <button
            style={{ ...btnPrimary, opacity: exportData && exportData.rows.length > 0 ? 1 : 0.5 }}
            onClick={downloadExportCsv}
            disabled={!exportData || exportData.rows.length === 0}
            title="Download last exported data as CSV"
          >
            {exportLoading ? "Fetching…" : "Download CSV"}
          </button>
          <button
            style={{ ...btnPrimary, opacity: latestXml && sessionCreds ? 1 : 0.5 }}
            onClick={executeXml}
            disabled={!latestXml || !sessionCreds}
            title={!latestXml ? "No XML found in the last assistant message" : !sessionCreds ? "Connect first" : "Execute"}
          >
            Execute
          </button>
          <button
            style={{ ...btnPrimary, opacity: sessionCreds ? 1 : 0.5 }}
            onClick={runApiTest}
            disabled={!sessionCreds || testLoading}
            title="Create one of each entity (Ai_TESTERX) and report pass/fail"
          >
            {testLoading ? "Running test…" : "Run API test"}
          </button>
        </div>
      </div>
      {opStatus.phase !== "idle" && (
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 10,
            background:
              opStatus.phase === "running"
                ? "#0f172a"
                : opStatus.phase === "done"
                ? "#052e16"
                : "#3f1313",
            padding: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              {opStatus.phase === "running"
                ? `⏳ ${opStatus.label}`
                : opStatus.phase === "done"
                ? `✅ ${opStatus.label} completed`
                : `⚠️ ${opStatus.label} failed`}
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>{opStatus.detail || ""}</div>
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "#111827", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(
                  opStatus.phase === "done" ? 100 : 8,
                  opStatus.progressPct ?? (opStatus.phase === "running" ? 35 : 100)
                )}%`,
                background:
                  opStatus.phase === "error"
                    ? "#ef4444"
                    : "repeating-linear-gradient(45deg, #2563eb, #2563eb 10px, #3b82f6 10px, #3b82f6 20px)",
                animation: opStatus.phase === "running" ? "progressMove 1.2s linear infinite" : "none",
                transition: "width 250ms ease",
              }}
            />
          </div>
        </div>
      )}
      {opHistory.length > 0 && (
        <div style={{ border: "1px solid #334155", borderRadius: 10, background: "#0f172a", padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#cbd5e1", marginBottom: 8 }}>
            Recent Operations
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {opHistory.map((h, i) => (
              <div
                key={`${h.ts}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr",
                  gap: 10,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: h.phase === "done" ? "#052e16" : "#3f1313",
                }}
              >
                <div style={{ fontSize: 12, color: "#cbd5e1" }}>{tsLabel(h.ts)}</div>
                <div style={{ fontSize: 12, color: "#e2e8f0" }}>
                  {h.phase === "done" ? "✅" : "⚠️"} <strong>{h.label}</strong>
                  {h.detail ? ` — ${h.detail}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {connectOpen && (
        <div style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#1e293b" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <label style={lbl}>
              Data Center
              <select
                value={draft.dataCenter}
                onChange={(e) => setDraft((d) => ({ ...d, dataCenter: e.target.value as DC }))}
                style={inp}
              >
                <option value="US">US</option>
                <option value="CA">CA</option>
                <option value="UK">UK</option>
                <option value="EU">EU</option>
              </select>
            </label>
            <label style={lbl}>
              Domain name (optional – for some API calls)
              <input
                value={draft.domain}
                onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))}
                onBlur={(e) => setDraft((d) => ({ ...d, domain: normalizeField(e.target.value) }))}
                placeholder="e.g. Krause and Kinsman"
                style={inp}
              />
            </label>
            <label style={lbl}>
              Username
              <input
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                onBlur={(e) => setDraft((d) => ({ ...d, username: normalizeField(e.target.value) }))}
                style={inp}
              />
            </label>
            <label style={lbl}>
              Password (session only)
              <input
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                type="password"
                style={inp}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              style={btnPrimary}
              disabled={connectLoading}
              onClick={async () => {
                const domain = normalizeField(draft.domain);
                const u = normalizeField(draft.username);
                const p = draft.password.trim();
                if (!u || !p) return alert("Username and password required.");
                const encodedAuth = btoa(`${u}:${p}`);
                setConnectLoading(true);
                try {
                  setSessionCreds({ dataCenter: draft.dataCenter, domain: domain || "", username: u, encodedAuth });
                  setDraft((d) => ({ ...d, password: "" }));
                  setConnectOpen(false);
                } finally {
                  setConnectLoading(false);
                }
              }}
            >
              {connectLoading ? "Saving…" : "Save & Connect"}
            </button>
            <button
              style={btnGhost}
              onClick={() => {
                setSessionCreds(null);
                setDraft((d) => ({ ...d, password: "" }));
              }}
            >
              Disconnect
            </button>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Password is never stored in DB. This session keeps only Base64 auth in memory.
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid #334155", borderRadius: 12, background: "#1e293b" }}>
        <div style={{ padding: 14, borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>Chat</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Plan → Payload → Execute</div>
        </div>

        <div style={{ padding: 14, maxHeight: 520, overflow: "auto" }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{tsLabel(m.ts)}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: m.role === "user" ? "#60a5fa" : "#e2e8f0" }}>
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{m.content}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid #334155", display: "flex", gap: 10 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(220, Math.max(44, el.scrollHeight))}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Describe what you want to build…"
            rows={1}
            style={{
              ...inp,
              flex: 1,
              resize: "none",
              minHeight: 44,
              maxHeight: 220,
              overflowY: "auto",
              lineHeight: 1.45,
            }}
          />
          <button style={btnPrimary} onClick={send} disabled={dncLoading || skillMigrateLoading}>
            {skillMigrateLoading ? "Running…" : dncLoading ? "DNC…" : "Send"}
          </button>
        </div>
        {batchProgress.active && (
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              Batch progress: {batchProgress.done}/{batchProgress.total} · {batchProgress.current}
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "#0f172a", overflow: "hidden", border: "1px solid #334155" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(2, Math.round((batchProgress.done / Math.max(1, batchProgress.total)) * 100))}%`,
                  background:
                    "repeating-linear-gradient(45deg, #2563eb, #2563eb 10px, #3b82f6 10px, #3b82f6 20px)",
                  animation: "progressMove 1.2s linear infinite",
                  transition: "width 250ms ease",
                }}
              />
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes progressMove { from { background-position: 0 0; } to { background-position: 40px 0; } }`}</style>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, color: "#94a3b8" };

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#e2e8f0",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#1e40af,#3b82f6)",
  color: "white",
  fontWeight: 800,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  cursor: "pointer",
  background: "#1e293b",
  color: "#e2e8f0",
  fontWeight: 800,
};

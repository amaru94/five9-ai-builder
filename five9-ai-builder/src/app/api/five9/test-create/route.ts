/**
 * Automated test: create one of each Five9 entity named "Ai_TESTERX".
 * POST with { dataCenter, encodedAuth }. Returns pass/fail per step.
 * Use to validate and tune SOAP payloads.
 */
import { z } from "zod";

type DC = "US" | "CA" | "UK" | "EU";

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
});

function five9BaseUrl(dc: DC): string {
  switch (dc) {
    case "CA": return "https://api.five9.ca";
    case "UK": return "https://api.five9.eu";
    case "EU": return "https://api.eu.five9.com";
    default: return "https://api.five9.com";
  }
}

const VERSIONS = [
  { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
  { path: "v9_5", ns: "http://service.admin.ws.five9.com/v9_5/" },
  { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
] as const;

function envelope(ns: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${ns}">
  <soapenv:Header/>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
}

async function tryAllVersions(
  base: string,
  encodedAuth: string,
  operation: string,
  buildBody: (ns: string) => string
): Promise<{ ok: boolean; text: string }> {
  let last = { ok: false, text: "" };
  for (const { path, ns } of VERSIONS) {
    const url = `${base}/wsadmin/${path}/AdminWebService`;
    const body = buildBody(ns);
    const xml = envelope(ns, body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          SOAPAction: `"${ns}${operation}"`,
          authorization: `Basic ${encodedAuth}`,
        },
        body: xml,
      });
      const text = await res.text();
      const isFault = /<fault|:Fault|Fault occurred|faultstring/i.test(text);
      last = { ok: res.ok && !isFault, text };
      if (last.ok) return last;
    } catch (e) {
      last = { ok: false, text: String(e) };
    }
  }
  return last;
}

function extractFault(text: string): string {
  const m = text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim().slice(0, 300) : text.slice(0, 300);
}

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { dataCenter, encodedAuth } = parsed.data;
  const base = five9BaseUrl(dataCenter);
  const results: { step: string; ok: boolean; fault?: string }[] = [];

  const name = "Ai_TESTERX";

  // 1. Disposition
  let r = await tryAllVersions(base, encodedAuth, "createDisposition", (ns) => `
    <ser:createDisposition>
      <disposition xmlns="">
        <name>${name}</name>
        <description>API test disposition</description>
        <type>RedialNumber</type>
        <agentMustConfirm>true</agentMustConfirm>
        <typeParameters><useTimer>false</useTimer><attempts>99</attempts></typeParameters>
      </disposition>
    </ser:createDisposition>`);
  results.push({ step: "createDisposition", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 2. Skill
  r = await tryAllVersions(base, encodedAuth, "createSkill", (ns) => `
    <ser:createSkill>
      <skillInfo xmlns="">
        <skill><name>${name}</name><description>API test skill</description></skill>
      </skillInfo>
    </ser:createSkill>`);
  results.push({ step: "createSkill", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 3. Campaign profile — expected elements: name, description, initialCallPriority, numberOfAttempts, dialingTimeout, maxCharges, dialingSchedule, ANI
  r = await tryAllVersions(base, encodedAuth, "createCampaignProfile", (ns) => `
    <ser:createCampaignProfile>
      <campaignProfile xmlns="">
        <name>${name}</name>
        <description>API test profile</description>
        <initialCallPriority>50</initialCallPriority>
        <numberOfAttempts>5</numberOfAttempts>
        <dialingTimeout>60</dialingTimeout>
        <maxCharges>0</maxCharges>
        <ANI></ANI>
        <dialingSchedule><dialingSchedules/><includeNumbers/></dialingSchedule>
      </campaignProfile>
    </ser:createCampaignProfile>`);
  results.push({ step: "createCampaignProfile", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 4. Contact field
  r = await tryAllVersions(base, encodedAuth, "createContactField", (ns) => `
    <ser:createContactField>
      <field xmlns="">
        <name>${name}</name>
        <type>STRING</type>
        <displayAs>Short</displayAs>
      </field>
    </ser:createContactField>`);
  results.push({ step: "createContactField", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 5. Not ready reason code
  r = await tryAllVersions(base, encodedAuth, "createReasonCode", (ns) => `
    <ser:createReasonCode>
      <reasonCode xmlns="">
        <name>${name}</name>
        <type>NotReady</type>
        <enabled>true</enabled>
      </reasonCode>
    </ser:createReasonCode>`);
  results.push({ step: "createReasonCode (NotReady)", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 6. List
  r = await tryAllVersions(base, encodedAuth, "createList", (ns) => `
    <ser:createList><listName>${name}</listName></ser:createList>`);
  results.push({ step: "createList", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 7. Inbound campaign
  r = await tryAllVersions(base, encodedAuth, "createInboundCampaign", (ns) => `
    <ser:createInboundCampaign>
      <campaign xmlns="">
        <name>${name}</name>
      </campaign>
    </ser:createInboundCampaign>`);
  results.push({ step: "createInboundCampaign", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  // 8. Outbound campaign
  r = await tryAllVersions(base, encodedAuth, "createOutboundCampaign", (ns) => `
    <ser:createOutboundCampaign>
      <campaign xmlns="">
        <name>${name}</name>
      </campaign>
    </ser:createOutboundCampaign>`);
  results.push({ step: "createOutboundCampaign", ok: r.ok, fault: r.ok ? undefined : extractFault(r.text) });

  const passed = results.filter((x) => x.ok).length;
  return Response.json({
    summary: `${passed}/${results.length} passed`,
    results,
  });
}

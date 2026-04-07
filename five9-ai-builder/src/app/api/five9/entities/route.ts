import { z } from "zod";

type DC = "US" | "CA" | "UK" | "EU";
const ENTITY_TYPES = ["dispositions", "campaigns", "skills", "campaignProfiles"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
  entityType: z.enum(ENTITY_TYPES),
});

function five9BaseUrl(dc: DC): string {
  switch (dc) {
    case "CA":
      return "https://api.five9.ca";
    case "UK":
      return "https://api.five9.eu";
    case "EU":
      return "https://api.eu.five9.com";
    case "US":
    default:
      return "https://api.five9.com";
  }
}

const VERSIONS: { path: string; ns: string }[] = [
  { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
  { path: "v9_5", ns: "http://service.admin.ws.five9.com/v9_5/" },
  { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
];

function buildSoapBody(entityType: EntityType, ns: string, omitOptionalPattern = false): string {
  const n = (tag: string) => (tag.includes(":") ? tag : `ns:${tag}`);
  const pattern = omitOptionalPattern ? "" : ".*";
  switch (entityType) {
    case "dispositions":
      if (omitOptionalPattern) return `<ns:getDispositions></ns:getDispositions>`;
      return `<ns:getDispositions><${n("dispositionNamePattern")}>${pattern}</${n("dispositionNamePattern")}></ns:getDispositions>`;
    case "campaigns":
      if (omitOptionalPattern) return `<ns:getCampaigns></ns:getCampaigns>`;
      return `<ns:getCampaigns><${n("campaignNamePattern")}>${pattern}</${n("campaignNamePattern")}></ns:getCampaigns>`;
    case "skills":
      if (omitOptionalPattern) return `<ns:getSkills></ns:getSkills>`;
      return `<ns:getSkills><${n("skillNamePattern")}>${pattern}</${n("skillNamePattern")}></ns:getSkills>`;
    case "campaignProfiles":
      if (omitOptionalPattern) return `<ns:getCampaignProfiles></ns:getCampaignProfiles>`;
      return `<ns:getCampaignProfiles><${n("namePattern")}>${pattern}</${n("namePattern")}></ns:getCampaignProfiles>`;
    default:
      throw new Error(`Unknown entityType: ${entityType}`);
  }
}

function buildSoapEnvelope(entityType: EntityType, ns: string, omitOptionalPattern = false): string {
  const body = buildSoapBody(entityType, ns, omitOptionalPattern);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${ns}">
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractFaultMessage(xml: string): string {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i) || xml.match(/<faultstring>([^<]+)</i);
  if (m) return m[1].trim().replace(/\s+/g, " ");
  if (/<env:Fault>|Fault occurred/i.test(xml)) return "Five9 returned a fault. Check credentials and Admin Web Service access.";
  return "Five9 request failed.";
}

/** Strip XML namespace prefix from a tag or value. */
function stripNs(s: string): string {
  return s.replace(/^[^:]+:/, "").trim();
}

/**
 * Extract all rows from a SOAP response. Each <return> or <item> becomes one row.
 * For each row, all direct child elements with simple text content become columns (tag name -> value).
 * Nested complex elements are skipped; their direct text is not flattened.
 */
function parseEntitiesFromXml(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const blockRegex = /<(?:return|item|[^>]*:return|[^>]*:item)[^>]*>([\s\S]*?)<\/(?:return|item|[^>]*:return|[^>]*:item)>/gi;
  let block: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((block = blockRegex.exec(xml)) !== null) {
    const inner = block[1];
    if (inner.length > 5000 || seen.has(inner)) continue;
    seen.add(inner);

    const row: Record<string, string> = {};
    // Match leaf elements: <tag>text</tag> or <ns:tag>text</ns:tag> (text has no <)
    const leafRegex = /<([^:>]+:[^>]+|[^>]+)>([^<]*)<\/[^>]+>/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = leafRegex.exec(inner)) !== null) {
      const fullTag = tagMatch[1];
      const key = stripNs(fullTag).trim();
      const value = tagMatch[2].replace(/\s+/g, " ").trim();
      if (key && value.length < 2000) row[key] = value;
    }
    // Also match elements with nested content: take first line of text only
    const nestedRegex = /<([^:>]+:[^>]+|[^>]+)>([\s\S]*?)<\/([^>]+)>/g;
    while ((tagMatch = nestedRegex.exec(inner)) !== null) {
      const key = stripNs(tagMatch[1]).trim();
      if (row[key]) continue;
      const raw = tagMatch[2];
      const text = raw.replace(/<[\s\S]*?>/g, " ").replace(/\s+/g, " ").trim();
      if (key && text && text.length < 2000) row[key] = text;
    }

    if (Object.keys(row).length > 0) rows.push(row);
  }

  if (rows.length === 0) {
    const simpleList = xml.match(/<(?:name|[^>]*:name)[^>]*>([^<]+)</gi) || [];
    for (let i = 0; i < simpleList.length; i++) {
      const name = simpleList[i].replace(/<[^>]+>/, "").trim();
      if (name) rows.push({ name });
    }
  }
  return rows;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { dataCenter, encodedAuth, entityType } = parsed.data;
  const base = five9BaseUrl(dataCenter);
  let lastError = { error: "Five9 request failed" as const, message: "" };

  const methodName = {
    dispositions: "getDispositions",
    campaigns: "getCampaigns",
    skills: "getSkills",
    campaignProfiles: "getCampaignProfiles",
  }[entityType];
  const soapAction = (ns: string) => (ns.endsWith("/") ? `${ns}${methodName}` : `${ns}/${methodName}`);

  for (const { path, ns } of VERSIONS) {
    for (const omitPattern of [false, true]) {
      const url = `${base}/wsadmin/${path}/AdminWebService`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "text/xml; charset=utf-8",
            "SOAPAction": `"${soapAction(ns)}"`,
            authorization: `Basic ${encodedAuth}`,
          },
          body: buildSoapEnvelope(entityType, ns, omitPattern),
        });

        const text = await res.text();
        const hasFault = /<fault|:Fault|Fault occurred/i.test(text);

        if (!res.ok) {
          lastError = { error: "Five9 request failed", message: extractFaultMessage(text) || `HTTP ${res.status}` };
          continue;
        }
        if (hasFault) {
          lastError = { error: "Five9 request failed", message: extractFaultMessage(text) };
          continue;
        }

        const entities = parseEntitiesFromXml(text);
        return Response.json({ ok: true, entityType, entities, rawXml: text.slice(0, 6000) });
      } catch (err) {
        console.error("Five9 entities fetch error", url, err);
        lastError = { error: "Five9 request failed", message: "Network error" };
      }
    }
  }

  const message = lastError.message || lastError.error;
  return Response.json(
    { error: lastError.error, message, details: message },
    { status: 502 }
  );
}

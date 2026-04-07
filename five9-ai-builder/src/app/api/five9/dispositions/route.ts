import { z } from "zod";

type DC = "US" | "CA" | "UK" | "EU";

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
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

// SOAP envelope for getDispositions(pattern). Pattern ".*" = all. Uses v11_5 to match validate/entities.
function buildGetDispositionsSoap(): string {
  const NS = "http://service.admin.ws.five9.com/v11_5/";
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:getDispositions>
      <dispositionNamePattern>.*</dispositionNamePattern>
    </ns:getDispositions>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Extract disposition rows from Five9 getDispositionsResponse XML (v15-style return). */
function parseDispositionsFromXml(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  // Response can be return/name, return/description, etc. or nested in list
  const stripNs = (raw: string) => raw.replace(/^[^:]+:/, "").trim();
  const regex = /<(?:(?:return|item)|[^>]*:return|[^>]*:item)[^>]*>([\s\S]*?)<\/(?:return|item|[^>]*:return|[^>]*:item)>/gi;
  let block: RegExpExecArray | null;
  const seenBlocks = new Set<string>();
  while ((block = regex.exec(xml)) !== null) {
    const inner = block[1];
    if (inner.length > 500 || seenBlocks.has(inner)) continue;
    seenBlocks.add(inner);
    const nameEl = inner.match(/<(?:name|[^>]*:name)[^>]*>([\s\S]*?)<\/(?:name|[^>]*:name)>/i);
    const descEl = inner.match(/<(?:description|[^>]*:description)[^>]*>([\s\S]*?)<\/(?:description|[^>]*:description)>/i);
    const name = nameEl ? stripNs(nameEl[1].replace(/<[^>]+>/g, "").trim()) : "";
    const description = descEl ? stripNs(descEl[1].replace(/<[^>]+>/g, "").trim()) : "";
    if (name || description || inner.trim().length > 0) {
      const agentConfirm = /<(?:agentMustConfirm|[^>]*:agentMustConfirm)[^>]*>true<\/[^>]+>/i.test(inner);
      const agentWorksheet = /<(?:agentMustCompleteWorksheet|[^>]*:agentMustCompleteWorksheet)[^>]*>true<\/[^>]+>/i.test(inner);
      const resetAttempts = /<(?:resetAttemptsCounter|[^>]*:resetAttemptsCounter)[^>]*>true<\/[^>]+>/i.test(inner);
      const typeEl = inner.match(/<(?:type|[^>]*:type)[^>]*>([\s\S]*?)<\/(?:type|[^>]*:type)>/i);
      const type = typeEl ? stripNs(typeEl[1].replace(/<[^>]+>/g, "").trim()) : "";
      rows.push({
        name: name || "(unnamed)",
        description,
        agentMustConfirm: String(agentConfirm),
        agentMustCompleteWorksheet: String(agentWorksheet),
        resetAttemptsCounter: String(resetAttempts),
        type: type || "",
      });
    }
  }
  // Fallback: any name/description pairs elsewhere in XML
  if (rows.length === 0) {
    const nameList = xml.match(/<(?:name|[^>]*:name)[^>]*>([^<]+)</gi) || [];
    const descList = xml.match(/<(?:description|[^>]*:description)[^>]*>([^<]*)</gi) || [];
    for (let i = 0; i < Math.max(nameList.length, descList.length); i++) {
      const name = nameList[i] ? nameList[i].replace(/<[^>]+>/, "").trim() : "";
      const desc = descList[i] ? descList[i].replace(/<[^>]+>/, "").trim() : "";
      if (name) rows.push({ name, description: desc, agentMustConfirm: "", agentMustCompleteWorksheet: "", resetAttemptsCounter: "", type: "" });
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

  const { dataCenter, encodedAuth } = parsed.data;
  const url = `${five9BaseUrl(dataCenter)}/wsadmin/v11_5/AdminWebService`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        authorization: `Basic ${encodedAuth}`,
      },
      body: buildGetDispositionsSoap(),
    });

    const text = await res.text();

    if (!res.ok) {
      return Response.json({ error: "Five9 request failed", status: res.status, details: text.slice(0, 1000) }, { status: 502 });
    }

    const dispositions = parseDispositionsFromXml(text);
    return Response.json({ ok: true, dispositions, rawXml: text.slice(0, 8000) });
  } catch (err) {
    console.error("Five9 dispositions fetch error", err);
    return Response.json({ error: "Failed to fetch dispositions" }, { status: 500 });
  }
}

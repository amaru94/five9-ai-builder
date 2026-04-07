/**
 * Domain DNC add/remove via Five9 Admin SOAP — same path as Connect / entities.
 * No Python skill engine required when the user is Connected.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

type DC = "US" | "CA" | "UK" | "EU";

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
  action: z.enum(["add", "remove"]),
  numbers: z.array(z.string()).min(1).max(10000),
});

function five9BaseUrl(dc: DC): string {
  switch (dc) {
    case "CA":
      return "https://api.five9.ca";
    case "UK":
      return "https://api.five9.eu";
    case "EU":
      return "https://api.eu.five9.com";
    default:
      return "https://api.five9.com";
  }
}

const NANP = /^[2-9]\d{2}[2-9]\d{6}$/;

function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10 || !NANP.test(ten)) return null;
  return `+1${ten}`;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function buildDncEnvelope(
  operation: "removeNumbersFromDnc" | "addNumbersToDnc",
  e164List: string[],
  ns: string
): string {
  const nums = e164List.map((n) => `      <numbers>${xmlEscape(n)}</numbers>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:${operation}>
${nums}
    </ns:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractFault(xml: string): string {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim().slice(0, 500) : xml.slice(0, 400);
}

const VERSIONS = [
  { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
  { path: "v9_5", ns: "http://service.admin.ws.five9.com/v9_5/" },
  { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
] as const;

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, detail: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { dataCenter, encodedAuth, action, numbers: rawNumbers } = parsed.data;

  if (action === "remove") {
    return NextResponse.json(
      {
        ok: false,
        detail:
          "Domain DNC unblock (removeNumbersFromDnc) is disabled on this endpoint—it can remove or alter contact/list data in Five9, not just DNC. Use Five9 Admin → Lists → DNC, or Admin → Domain DNC bulk after confirming the risk.",
      },
      { status: 403 }
    );
  }
  const e164: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const r of rawNumbers) {
    const e = toE164(r);
    if (!e || seen.has(e)) {
      if (r.trim()) invalid.push(r.slice(0, 32));
      continue;
    }
    seen.add(e);
    e164.push(e);
  }

  if (e164.length === 0) {
    return NextResponse.json(
      { ok: false, detail: "No valid 10-digit US numbers after normalization." },
      { status: 400 }
    );
  }

  const base = five9BaseUrl(dataCenter);
  // remove is blocked on this endpoint; this route only supports adds.
  const op = "addNumbersToDnc";
  const CHUNK = 500;
  let lastFault = "";

  for (let i = 0; i < e164.length; i += CHUNK) {
    const chunk = e164.slice(i, i + CHUNK);
    let ok = false;
    let lastText = "";

    for (const { path, ns } of VERSIONS) {
      const url = `${base}/wsadmin/${path}/AdminWebService`;
      const xml = buildDncEnvelope(op, chunk, ns);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "text/xml; charset=utf-8",
            SOAPAction: '""',
            authorization: `Basic ${encodedAuth}`,
          },
          body: xml,
        });
        lastText = await res.text();
        const isFault = /<fault|:Fault|faultstring/i.test(lastText);
        if (res.ok && !isFault) {
          ok = true;
          break;
        }
        lastFault = extractFault(lastText);
      } catch (e) {
        lastFault = e instanceof Error ? e.message : String(e);
      }
    }

    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          detail: lastFault || "Five9 DNC call failed on all API versions.",
          action,
          count: e164.length,
        },
        { status: 502 }
      );
    }
  }

  const msg = `Submitted ${e164.length} number(s) to the domain DNC list.`;

  return NextResponse.json({
    ok: true,
    action: "add",
    count: e164.length,
    queued: false,
    message: msg,
    simulated: false,
    invalid_samples: invalid.slice(0, 10),
    e164_preview: e164.slice(0, 5),
  });
}

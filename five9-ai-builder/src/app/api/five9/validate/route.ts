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

/**
 * Validate credentials by calling Five9 AdminWebService.
 * We send a minimal SOAP request (getDispositions with pattern ".*") to the same
 * endpoint used for exports. If the server returns HTTP 200 and no SOAP Fault,
 * the username/password are accepted; otherwise we surface the fault message.
 */
const VERSIONS_TO_TRY: { path: string; ns: string }[] = [
  { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
  { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
];

function buildValidateSoap(ns: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:getDispositions>
      <ns:dispositionNamePattern>.*</ns:dispositionNamePattern>
    </ns:getDispositions>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractFaultMessage(xml: string): string {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i) || xml.match(/<faultstring>([^<]+)</i);
  if (m) return m[1].trim().replace(/\s+/g, " ");
  if (/<env:Fault>|Fault occurred/i.test(xml)) return "Five9 rejected the request. Check username, password, and data center. Your account must have Admin Web Service access.";
  return "Unable to connect to Five9. Check data center and try again.";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, message: "Invalid payload." }, { status: 400 });
  }

  const { dataCenter, encodedAuth } = parsed.data;
  const base = five9BaseUrl(dataCenter);
  let lastMessage = "";

  for (const { path, ns } of VERSIONS_TO_TRY) {
    const url = `${base}/wsadmin/${path}/AdminWebService`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          authorization: `Basic ${encodedAuth}`,
        },
        body: buildValidateSoap(ns),
      });

      const text = await res.text();
      const hasFault = /<fault|:Fault|Fault occurred/i.test(text);

      if (res.ok && !hasFault) {
        return Response.json({ ok: true });
      }
      lastMessage = extractFaultMessage(text);
    } catch (err) {
      console.error("Five9 validate error", url, err);
      lastMessage = "Network error. Check data center and try again.";
    }
  }

  return Response.json({ ok: false, message: lastMessage }, { status: 200 });
}

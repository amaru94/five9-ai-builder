/**
 * Five9 Admin Web Service — generic SOAP POST with v11_5 → v9_5 → v2 fallback.
 */

export type DC = "US" | "CA" | "UK" | "EU";

export const FIVE9_VERSIONS = [
  { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
  { path: "v9_5", ns: "http://service.admin.ws.five9.com/v9_5/" },
  { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
] as const;

export function five9BaseUrl(dc: DC): string {
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

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function extractSoapFault(xml: string): string {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim().slice(0, 600) : xml.slice(0, 400);
}

function isSoapOk(xml: string): boolean {
  return !/<fault|:Fault|faultstring/i.test(xml);
}

export type SoapResult = { ok: true; xml: string; version: string } | { ok: false; xml: string; fault: string; version: string };

/**
 * @param innerBody - XML inside <ns:operation>...</ns:operation> (unqualified child elements)
 */
export async function five9AdminSoap(
  encodedAuth: string,
  dc: DC,
  operation: string,
  innerBody: string
): Promise<SoapResult> {
  const base = five9BaseUrl(dc);
  let last: SoapResult = {
    ok: false,
    xml: "",
    fault: "No response",
    version: "",
  };

  for (const { path, ns } of FIVE9_VERSIONS) {
    const url = `${base}/wsadmin/${path}/AdminWebService`;
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${ns}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:${operation}>
${innerBody}
    </ns:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          SOAPAction: '""',
          authorization: `Basic ${encodedAuth}`,
        },
        body: envelope,
      });
      const xml = await res.text();
      const fault = extractSoapFault(xml);
      if (res.ok && isSoapOk(xml)) {
        return { ok: true, xml, version: path };
      }
      last = { ok: false, xml, fault: fault || res.statusText, version: path };
    } catch (e) {
      last = {
        ok: false,
        xml: "",
        fault: e instanceof Error ? e.message : String(e),
        version: path,
      };
    }
  }

  return last;
}

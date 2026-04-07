/**
 * Voice/call domain DNC recovery — Admin Web Service ONLY.
 *
 * IMPORTANT (Five9 semantics):
 * - removeNumbersFromDnc: removes the number from the **domain DNC block list** for voice.
 *   This codebase does NOT call list delete or contact delete APIs in this flow.
 * - deleteRecordFromList / deleteFromList / deleteContact: would **remove the row** from a
 *   dialing list or CRM — we never invoke those here.
 * - If records still disappear after removeNumbersFromDnc, that is **Five9 platform behavior**,
 *   not an extra SOAP call from this app.
 */

export type DC = "US" | "CA" | "UK" | "EU";

export const ADMIN_VERSIONS = [
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function normalizeE164Us(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `+1${ten}`;
}

/** SOAP envelope for checkDncForNumbers | removeNumbersFromDnc */
export function buildDncOperationEnvelope(
  operation: "checkDncForNumbers" | "removeNumbersFromDnc",
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

export function maskBasicAuthHeader(_encodedAuth: string): string {
  return "Basic *** (credentials masked)";
}

/** Truncate XML for logs/UI */
export function truncateXml(xml: string, max = 8000): string {
  if (xml.length <= max) return xml;
  return `${xml.slice(0, max)}\n… [truncated ${xml.length - max} chars]`;
}

/**
 * Parse Five9 checkDncForNumbers response: numbers that ARE on domain DNC.
 * Handles common return shapes (return / string / numbers elements).
 */
export function parseNumbersOnDncFromCheckResponse(xml: string): Set<string> {
  const found = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (/^\+1\d{10}$/.test(t)) {
      found.add(t);
      return;
    }
    const n = normalizeE164Us(t);
    if (n) found.add(n);
  };
  for (const m of xml.matchAll(/>(\+1\d{10})</g)) add(m[1]);
  // Some Five9 tenants may return numbers as plain 10-digit NANP (no +1).
  // normalizeE164Us() will convert them to +1XXXXXXXXXX.
  for (const m of xml.matchAll(/>(\d{10})</g)) add(m[1]);
  for (const m of xml.matchAll(/<(?:return|string|numbers)[^>]*>(\+1\d{10})<\/(?:return|string|numbers)>/gi)) {
    add(m[1]);
  }
  for (const m of xml.matchAll(/<item[^>]*>(\+1\d{10})<\/item>/gi)) add(m[1]);
  return found;
}

export function extractFault(xml: string): string {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim().slice(0, 600) : xml.slice(0, 400);
}

export type RecoveryLogStep = {
  step: string;
  soapMethod: string;
  endpointUrl: string;
  requestBodyMasked: string;
  responseBodyTruncated: string;
  ok: boolean;
  fault?: string;
  meta?: Record<string, unknown>;
};

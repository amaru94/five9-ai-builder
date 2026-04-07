import { z } from "zod";

type DC = "US" | "CA" | "UK" | "EU";

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  username: z.string().min(1),
  encodedAuth: z.string().min(1),
  xml: z.string().min(1),
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { dataCenter, encodedAuth, xml } = parsed.data;
  const base = five9BaseUrl(dataCenter);

  const VERSIONS = [
    { path: "v11_5", ns: "http://service.admin.ws.five9.com/v11_5/" },
    { path: "v9_5", ns: "http://service.admin.ws.five9.com/v9_5/" },
    { path: "v2", ns: "http://service.admin.ws.five9.com/v2/" },
  ] as const;

  // SOAPAction from first operation in Body
  const opMatch = xml.match(/<(?:ser:|ns:)?(createDisposition|getDispositions|modifyDisposition|removeDisposition|getCampaigns|getSkills|getCampaignProfiles|createCampaign|\w+)>/);
  const operation = opMatch?.[1];

  let lastText = "";
  let bestFaultText = "";
  let bestFaultScore = -1;
  const attempts: Array<{ version: string; status?: number; fault?: string }> = [];

  const scoreFault = (xml: string): number => {
    if (!xml) return 0;
    const hasDetail = /<detail[\s>]/i.test(xml);
    const msg = xml.match(/<message[^>]*>([\s\S]*?)<\/message>/i)?.[1]?.trim() || "";
    const fault = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim() || "";
    let score = 0;
    if (hasDetail) score += 20;
    if (msg.length) score += Math.min(40, msg.length / 3);
    if (fault.length && !/fault occurred while processing\.?/i.test(fault)) score += 30;
    score += Math.min(20, xml.length / 300);
    return score;
  };
  for (const { path, ns } of VERSIONS) {
    const url = `${base}/wsadmin/${path}/AdminWebService`;
    const soapAction = operation ? `"${ns}${operation}"` : undefined;
    // Normalize request to this version's namespace (replace any existing service namespace)
    const normalizedXml = xml
      .replace(/xmlns:ser="[^"]*"/g, `xmlns:ser="${ns}"`)
      .replace(/xmlns:ns="[^"]*"/g, `xmlns:ns="${ns}"`)
      .replace(/http:\/\/service\.admin\.ws\.five9\.com\/v\d+_?\d*\/?/g, ns);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          ...(soapAction && { SOAPAction: soapAction }),
          authorization: `Basic ${encodedAuth}`,
        },
        body: normalizedXml,
      });
      lastText = await res.text();
      const isFault = /<fault|:Fault|Fault occurred/i.test(lastText);
      if (res.ok && !isFault) {
        return new Response(lastText, {
          status: res.status,
          headers: { "content-type": "text/xml; charset=utf-8" },
        });
      }
      const fault = lastText.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim();
      attempts.push({ version: path, status: res.status, fault });
      const s = scoreFault(lastText);
      if (s > bestFaultScore) {
        bestFaultScore = s;
        bestFaultText = lastText;
      }
    } catch (err) {
      console.error("Five9 SOAP proxy error", url, err);
      attempts.push({
        version: path,
        fault: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const attemptComment = `<!-- tried versions: ${attempts
    .map((a) => `${a.version}:${a.status ?? "err"}${a.fault ? ":" + a.fault.slice(0, 80) : ""}`)
    .join(" | ")} -->`;
  const chosen =
    bestFaultText ||
    lastText ||
    "<env:Envelope xmlns:env=\"http://schemas.xmlsoap.org/soap/envelope/\"><env:Body><env:Fault><faultstring>All API versions failed</faultstring></env:Fault></env:Body></env:Envelope>";

  return new Response(`${attemptComment}\n${chosen}`, {
    status: 502,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
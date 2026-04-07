/**
 * Voice/call domain DNC recovery — SAFE path only:
 * 1) checkDncForNumbers (before)
 * 2) removeNumbersFromDnc — ONLY if number was on DNC (or forceRemoveEvenIfNotOnDnc)
 * 3) checkDncForNumbers (after)
 *
 * Does NOT call: deleteRecordFromList, deleteFromList, deleteContact, or any list/contact delete.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_VERSIONS,
  buildDncOperationEnvelope,
  extractFault,
  five9BaseUrl,
  maskBasicAuthHeader,
  normalizeE164Us,
  parseNumbersOnDncFromCheckResponse,
  truncateXml,
  type DC,
  type RecoveryLogStep,
} from "@/lib/five9VoiceDncRecovery";

const Schema = z.object({
  dataCenter: z.custom<DC>((v) => v === "US" || v === "CA" || v === "UK" || v === "EU"),
  encodedAuth: z.string().min(1),
  numbers: z.array(z.string()).min(1).max(100),
  /** If true, still call removeNumbersFromDnc even when pre-check says not on DNC (rare). */
  forceRemoveEvenIfNotOnDnc: z.boolean().optional().default(false),
});

async function postSoap(
  base: string,
  encodedAuth: string,
  operation: "checkDncForNumbers" | "removeNumbersFromDnc",
  e164Chunk: string[],
  logSteps: RecoveryLogStep[]
): Promise<{ ok: boolean; responseText: string; url: string }> {
  let lastText = "";
  let lastUrl = "";

  for (const { path, ns } of ADMIN_VERSIONS) {
    const url = `${base}/wsadmin/${path}/AdminWebService`;
    lastUrl = url;
    const xml = buildDncOperationEnvelope(operation, e164Chunk, ns);
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
      const ok = res.ok && !isFault;

      logSteps.push({
        step: `${operation}_attempt`,
        soapMethod: operation,
        endpointUrl: url,
        requestBodyMasked: truncateXml(
          xml.replace(/Authorization:[^\n]+/gi, "Authorization: " + maskBasicAuthHeader(""))
        ),
        responseBodyTruncated: truncateXml(lastText),
        ok,
        fault: ok ? undefined : extractFault(lastText),
        meta: { httpStatus: res.status },
      });

      if (ok) return { ok: true, responseText: lastText, url };
    } catch (e) {
      logSteps.push({
        step: `${operation}_attempt`,
        soapMethod: operation,
        endpointUrl: url,
        requestBodyMasked: truncateXml(xml),
        responseBodyTruncated: "",
        ok: false,
        fault: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { ok: false, responseText: lastText, url: lastUrl };
}

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { dataCenter, encodedAuth, numbers: raw, forceRemoveEvenIfNotOnDnc } = parsed.data;
  const base = five9BaseUrl(dataCenter);
  const logSteps: RecoveryLogStep[] = [];
  const e164: string[] = [];
  for (const r of raw) {
    const n = normalizeE164Us(r);
    if (n && !e164.includes(n)) e164.push(n);
  }
  if (e164.length === 0) {
    return NextResponse.json({ ok: false, detail: "No valid E.164 US numbers." }, { status: 400 });
  }

  const authLog = maskBasicAuthHeader(encodedAuth);
  console.log(
    `[voice-dnc-recovery] start numbers=${e164.join(",")} auth=${authLog} base=${base}`
  );

  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- Step 1: checkDnc before ---
  const before = await postSoap(base, encodedAuth, "checkDncForNumbers", e164, logSteps);
  const onDncBefore = before.ok ? parseNumbersOnDncFromCheckResponse(before.responseText) : new Set<string>();
  const perNumberBefore: Record<string, boolean> = {};
  for (const n of e164) perNumberBefore[n] = onDncBefore.has(n);

  if (!before.ok) {
    console.error("[voice-dnc-recovery] checkDncForNumbers (before) failed");
    return NextResponse.json(
      {
        ok: false,
        message:
          "Couldn't verify domain DNC with Five9 right now. Check your connection and try again.",
        detail: "checkDncForNumbers (before) failed",
        steps: logSteps,
      },
      { status: 502 }
    );
  }

  // --- Safety retry: Five9 can have short propagation delay or queued updates ---
  // Only retry when we got a full miss (all numbers not detected) and user isn't forcing removal.
  const allMissed = e164.every((n) => !onDncBefore.has(n));
  if (allMissed && !forceRemoveEvenIfNotOnDnc) {
    await sleep(2000);
    const retry = await postSoap(base, encodedAuth, "checkDncForNumbers", e164, logSteps);
    if (retry.ok) {
      const onDncRetry = parseNumbersOnDncFromCheckResponse(retry.responseText);
      for (const n of onDncRetry) onDncBefore.add(n);
      for (const n of e164) perNumberBefore[n] = onDncBefore.has(n);
      logSteps.push({
        step: "checkDncForNumbers_before_retry",
        soapMethod: "checkDncForNumbers",
        endpointUrl: "",
        requestBodyMasked: "",
        responseBodyTruncated: "",
        ok: true,
        meta: {
          allMissedFirstCheck: true,
          matchedAfterRetry: Object.fromEntries(e164.map((n) => [n, onDncBefore.has(n)])),
        },
      });
    } else {
      logSteps.push({
        step: "checkDncForNumbers_before_retry",
        soapMethod: "checkDncForNumbers",
        endpointUrl: "",
        requestBodyMasked: "",
        responseBodyTruncated: "",
        ok: false,
        fault: retry.responseText ? extractFault(retry.responseText) : "retry check failed",
      });
    }
  }

  const toRemove = e164.filter((n) => onDncBefore.has(n) || forceRemoveEvenIfNotOnDnc);
  const skippedNotOnDnc = e164.filter((n) => !onDncBefore.has(n) && !forceRemoveEvenIfNotOnDnc);

  logSteps.push({
    step: "decision",
    soapMethod: "(none)",
    endpointUrl: "",
    requestBodyMasked: "",
    responseBodyTruncated: "",
    ok: true,
    meta: {
      onDncBefore: Object.fromEntries(e164.map((n) => [n, onDncBefore.has(n)])),
      willCallRemoveNumbersFromDnc: toRemove,
      skippedRemoveBecauseNotOnDomainDnc: skippedNotOnDnc,
      forceRemoveEvenIfNotOnDnc,
    },
  });

  let removeOk = true;
  let removeFault = "";

  // --- Step 2: removeNumbersFromDnc ONLY for numbers on DNC (or force) ---
  if (toRemove.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < toRemove.length; i += CHUNK) {
      const chunk = toRemove.slice(i, i + CHUNK);
      const rm = await postSoap(base, encodedAuth, "removeNumbersFromDnc", chunk, logSteps);
      if (!rm.ok) {
        removeOk = false;
        removeFault = extractFault(rm.responseText) || logSteps[logSteps.length - 1]?.fault || "remove failed";
        break;
      }
    }
  } else {
    logSteps.push({
      step: "removeNumbersFromDnc_skipped",
      soapMethod: "removeNumbersFromDnc",
      endpointUrl: "",
      requestBodyMasked: "",
      responseBodyTruncated: "",
      ok: true,
      meta: {
        reason: "Number(s) not on domain DNC per checkDncForNumbers; no remove SOAP call made.",
      },
    });
  }

  // --- Step 3: checkDnc after ---
  const after = await postSoap(base, encodedAuth, "checkDncForNumbers", e164, logSteps);
  const onDncAfter = after.ok ? parseNumbersOnDncFromCheckResponse(after.responseText) : new Set<string>();
  const perNumberAfter: Record<string, boolean> = {};
  for (const n of e164) perNumberAfter[n] = onDncAfter.has(n);

  const summary = {
    numbers: e164,
    onDomainDncBefore: perNumberBefore,
    removeNumbersFromDncCalled: toRemove.length > 0 && removeOk,
    removeNumbersFromDncSucceeded: toRemove.length > 0 ? removeOk : null,
    skippedNotOnDomainDnc: skippedNotOnDnc,
    onDomainDncAfter: perNumberAfter,
    listOrContactVerified: false as const,
    listOrContactNote:
      "This flow does not call list/contact APIs. If the number is still not dialable after domain DNC clearance, investigate disposition, finalized contact state, or list membership in Five9 Admin — not SMS opt-in.",
  };

  console.log(`[voice-dnc-recovery] summary ${JSON.stringify(summary)}`);

  const overallOk = before.ok && (toRemove.length === 0 || removeOk);
  const message = buildShortSummary({
    toRemove,
    skippedNotOnDnc,
    removeOk,
    removeFault,
    onAfter: perNumberAfter,
  });

  return NextResponse.json({
    ok: overallOk,
    message,
    detail: toRemove.length && !removeOk ? removeFault : undefined,
    steps: logSteps,
    summary,
  });
}

/** Plain-language chat line — full SOAP trail stays in `steps` for server logs only. */
function buildShortSummary(p: {
  toRemove: string[];
  skippedNotOnDnc: string[];
  removeOk: boolean;
  removeFault: string;
  onAfter: Record<string, boolean>;
}): string {
  const parts: string[] = [];

  if (p.toRemove.length > 0 && p.removeOk) {
    const stillBlocked = p.toRemove.filter((n) => p.onAfter[n]);
    if (stillBlocked.length) {
      parts.push(
        `⚠️ Remove ran for ${p.toRemove.join(", ")}, but a follow-up check still shows domain DNC. Confirm in Five9 Admin if calls don't work.`
      );
    } else {
      parts.push(
        `✅ **Removed from domain call DNC:** ${p.toRemove.join(", ")}.`
      );
    }
  } else if (p.toRemove.length > 0 && !p.removeOk) {
    parts.push(
      `⚠️ **Could not remove from domain DNC:** ${p.removeFault.slice(0, 280)}${p.removeFault.length > 280 ? "…" : ""}`
    );
  }

  if (p.skippedNotOnDnc.length > 0) {
    const s = p.skippedNotOnDnc.join(", ");
    if (p.toRemove.length === 0) {
      parts.push(
        `ℹ️ **Not on domain DNC** — ${s}. Nothing to remove for voice DNC. If you still can't dial, check disposition or list rules in Five9.`
      );
    } else {
      parts.push(`ℹ️ Also skipped (not on domain DNC): ${s}.`);
    }
  }

  return parts.join(" ") || "Done.";
}

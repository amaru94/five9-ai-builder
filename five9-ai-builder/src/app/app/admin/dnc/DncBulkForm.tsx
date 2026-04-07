"use client";

import { useState } from "react";
import Link from "next/link";

export default function DncBulkForm() {
  const [action, setAction] = useState<"add" | "remove">("add");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemoveRisk, setConfirmRemoveRisk] = useState(false);

  async function submit() {
    setErr(null);
    setResult(null);
    const lines = text
      .split(/[\n,;\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      setErr("Paste at least one 10-digit number.");
      return;
    }
    if (action === "remove" && !confirmRemoveRisk) {
      setErr("Check the box to confirm you understand remove-from-domain-DNC risks.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/dnc/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, numbers: lines }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(typeof data.detail === "string" ? data.detail : JSON.stringify(data));
        return;
      }
      setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "Inter, system-ui", padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/admin" style={{ color: "#94a3b8", fontSize: 14 }}>
        ← Admin
      </Link>
      <h1 style={{ marginTop: 16, fontSize: 22, fontWeight: 800 }}>Domain DNC bulk</h1>
      <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.5 }}>
        Up to <strong>10,000</strong> unique US numbers (10-digit). Normalized to E.164 (+1) before Five9.
        <strong> Add</strong> outside 11 PM–6 AM Pacific is queued — you&apos;ll see the after-hours message.
      </p>

      <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="radio" checked={action === "add"} onChange={() => setAction("add")} />
          Add to DNC
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="radio"
            checked={action === "remove"}
            onChange={() => {
              setAction("remove");
              setConfirmRemoveRisk(false);
            }}
          />
          Remove from DNC
        </label>
      </div>

      {action === "remove" && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: "#422006",
            border: "1px solid #a16207",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#fef3c7",
          }}
        >
          <strong>Remove from domain DNC</strong> uses Five9 <code>removeNumbersFromDnc</code>. In many
          tenants this can change or drop <strong>contact / list records</strong> tied to those numbers—not
          just a DNC flag. Prefer <strong>Five9 Admin → Lists → DNC</strong> if you need a narrower change.
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={confirmRemoveRisk}
              onChange={(e) => setConfirmRemoveRisk(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>I understand and still want to run bulk domain DNC removal via this tool.</span>
          </label>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"5551234567\n5559876543\n…"}
        rows={12}
        style={{
          width: "100%",
          marginTop: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #334155",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "ui-monospace, monospace",
          fontSize: 13,
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          background: "#3b82f6",
          color: "#fff",
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "…" : "Submit"}
      </button>

      {err && (
        <pre
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 10,
            background: "#450a0a",
            color: "#fecaca",
            whiteSpace: "pre-wrap",
            fontSize: 13,
          }}
        >
          {err}
        </pre>
      )}

      {result && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 10,
            background: result.queued ? "#1e3a5f" : "#14532d",
            color: "#e2e8f0",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            {result.queued ? "Queued (after-hours)" : "Done"}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>{String((result as any).message)}</div>
          {(result as any).job_id != null && (
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              Job ID: <code>{String((result as any).job_id)}</code>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Count: {String(result.count)} · Action: {String(result.action)}
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { parseSkillMigrationCsv, type SkillMigrationRow } from "@/lib/skillMigrationCsv";

type DC = "US" | "CA" | "UK" | "EU";

const SAMPLE_CSV = `source_skill_name,target_skill_name,clone,migrate_users,user_login
IB_ENG_FL_BASE,IB_ENG_FL_TV,Y,N,
IB_ENG_FL_BASE,IB_ENG_FL_CABLE,Y,N,
IB_ENG_TEMPLATE,IB_ENG_FL_TV,Y,Y,jdoe@acme.com`;

export default function SkillMigrationForm() {
  const [dataCenter, setDataCenter] = useState<DC>("US");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [dryRun, setDryRun] = useState(true);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [createOnly, setCreateOnly] = useState(false);
  const [setDescriptionAll, setSetDescriptionAll] = useState("");
  const [progress, setProgress] = useState<{
    active: boolean;
    done: number;
    total: number;
    current: string;
  }>({ active: false, done: 0, total: 0, current: "" });

  async function onCsvFileSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        setErr("Selected CSV is empty.");
        return;
      }
      setCsvText(text);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to read CSV file");
    }
  }

  async function run() {
    setErr(null);
    setResult(null);
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) {
      setErr("Enter Five9 username and password (same as Connect). Session-only — not stored.");
      return;
    }
    let encodedAuth: string;
    try {
      encodedAuth = btoa(`${u}:${p}`);
    } catch {
      setErr("Username/password must be encodable (ASCII).");
      return;
    }
    if (!csvText.trim()) {
      setErr("Paste CSV data.");
      return;
    }

    const parsed = parseSkillMigrationCsv(csvText);
    if (!parsed.rows.length) {
      setErr(parsed.errors.join("\n") || "No valid CSV rows.");
      return;
    }
    const rows: SkillMigrationRow[] = parsed.rows.map((r) => ({
      ...r,
      migrate_users: createOnly ? false : r.migrate_users,
      user_login: createOnly ? "" : r.user_login,
      target_description: setDescriptionAll.trim() || r.target_description || "",
    }));

    setLoading(true);
    try {
      if (dryRun) {
        const r = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dataCenter,
            encodedAuth,
            rows,
            dryRun: true,
            confirmBulkMigrate: false,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok && !data.steps) {
          setErr(typeof data.detail === "string" ? data.detail : JSON.stringify(data));
          return;
        }
        setResult(data);
        setPassword("");
        return;
      }

      // Execute mode: run row-by-row for live progress and scalability.
      setProgress({ active: true, done: 0, total: rows.length, current: "Starting..." });
      const allSteps: Array<{ row: number; action: string; ok: boolean; detail: string }> = [];
      let failures = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setProgress({
          active: true,
          done: i,
          total: rows.length,
          current: `${row.source_skill_name} → ${row.target_skill_name}`,
        });
        const r = await fetch("/api/five9/skills/migrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dataCenter,
            encodedAuth,
            rows: [row],
            dryRun: false,
            confirmBulkMigrate: confirmBulk || createOnly ? true : confirmBulk,
          }),
        });
        const data = await r.json().catch(() => ({}));
        const ok = !!data.ok;
        if (!ok) failures++;
        const rowSteps =
          (data.steps as Array<{ row: number; action: string; ok: boolean; detail: string }>) || [];
        if (rowSteps.length) allSteps.push(...rowSteps);
        else {
          allSteps.push({
            row: i + 1,
            action: "row_execute",
            ok,
            detail: data.summary || data.detail || (ok ? "done" : "failed"),
          });
        }
      }
      setProgress({ active: false, done: rows.length, total: rows.length, current: "Completed" });
      setResult({
        ok: failures === 0,
        summary: `Executed ${rows.length} row(s). ${failures ? `${failures} row(s) need review.` : "Done."}`,
        steps: allSteps,
        rowCount: rows.length,
      });
      setPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
      setProgress((p) => ({ ...p, active: false }));
    }
  }

  return (
    <main style={{ fontFamily: "Inter, system-ui", padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <Link href="/app/admin" style={{ color: "#94a3b8", fontSize: 14 }}>
        ← Admin
      </Link>
      <h1 style={{ marginTop: 16, fontSize: 22, fontWeight: 800 }}>Skill clone & user migration</h1>
      <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
        <strong>Owned CSV format:</strong> <code>source_skill_name</code>, <code>target_skill_name</code>,{" "}
        <code>clone</code> (Y/N), <code>migrate_users</code> (Y/N), <code>user_login</code> (agent user
        name, or <code>*</code> to auto-discover who has the source skill — capped). Aliases:{" "}
        <code>existing_skill</code>/<code>new_skill</code>. See <code>docs/SKILL_MIGRATION_CSV.md</code>.
      </p>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 12,
          border: "1px solid #334155",
          background: "#1e293b",
          display: "grid",
          gap: 12,
          maxWidth: 480,
        }}
      >
        <label style={{ fontSize: 13, color: "#94a3b8" }}>
          Data center
          <select
            value={dataCenter}
            onChange={(e) => setDataCenter(e.target.value as DC)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          >
            <option value="US">US</option>
            <option value="CA">CA</option>
            <option value="UK">UK</option>
            <option value="EU">EU</option>
          </select>
        </label>
        <label style={{ fontSize: 13, color: "#94a3b8" }}>
          Five9 username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          />
        </label>
        <label style={{ fontSize: 13, color: "#94a3b8" }}>
          Password (not stored)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          />
        </label>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e2e8f0" }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (preview only)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e2e8f0" }}>
          <input type="checkbox" checked={confirmBulk} onChange={(e) => setConfirmBulk(e.target.checked)} />
          Confirm bulk user migration (&gt;20 ops)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e2e8f0" }}>
          <input type="checkbox" checked={createOnly} onChange={(e) => setCreateOnly(e.target.checked)} />
          Create skills only (skip user moves)
        </label>
        <button
          type="button"
          onClick={() => setCsvText(SAMPLE_CSV)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #475569",
            background: "#334155",
            color: "#e2e8f0",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Load sample CSV
        </button>
        <label
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #475569",
            background: "#0f172a",
            color: "#e2e8f0",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv,.txt"
            style={{ display: "none" }}
            onChange={(e) => onCsvFileSelected(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div style={{ marginTop: 10, maxWidth: 440 }}>
        <label style={{ fontSize: 12, color: "#94a3b8" }}>
          Optional: set this description for all target skills
          <input
            value={setDescriptionAll}
            onChange={(e) => setSetDescriptionAll(e.target.value)}
            placeholder='e.g. TV Marketing'
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          />
        </label>
      </div>

      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={14}
        style={{
          width: "100%",
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #334155",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
        }}
      />

      <button
        type="button"
        onClick={run}
        disabled={loading}
        style={{
          marginTop: 14,
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          background: loading ? "#475569" : "linear-gradient(135deg,#1e40af,#3b82f6)",
          color: "white",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Running…" : dryRun ? "Run dry run" : "Execute"}
      </button>
      {progress.active && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>
            {progress.done}/{progress.total} completed · {progress.current}
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "#0f172a", overflow: "hidden", border: "1px solid #334155" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(4, Math.round((progress.done / Math.max(1, progress.total)) * 100))}%`,
                background:
                  "repeating-linear-gradient(45deg, #2563eb, #2563eb 10px, #3b82f6 10px, #3b82f6 20px)",
                animation: "progressMove 1.2s linear infinite",
                transition: "width 220ms ease",
              }}
            />
          </div>
        </div>
      )}

      {err && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: "#450a0a",
            border: "1px solid #991b1b",
            color: "#fecaca",
            fontSize: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: result.ok ? "#052e16" : "#422006",
              border: `1px solid ${result.ok ? "#166534" : "#a16207"}`,
              color: result.ok ? "#bbf7d0" : "#fef3c7",
              marginBottom: 12,
            }}
          >
            {(result.summary as string) || JSON.stringify(result.ok)}
          </div>
          {Array.isArray(result.csvWarnings) && result.csvWarnings.length > 0 && (
            <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 8 }}>
              CSV warnings: {(result.csvWarnings as string[]).join("; ")}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#94a3b8", maxHeight: 420, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #334155" }}>
                  <th style={{ padding: 6 }}>Row</th>
                  <th style={{ padding: 6 }}>Action</th>
                  <th style={{ padding: 6 }}>OK</th>
                  <th style={{ padding: 6 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {((result.steps as { row: number; action: string; ok: boolean; detail: string }[]) || []).map(
                  (s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={{ padding: 6 }}>{s.row}</td>
                      <td style={{ padding: 6, fontFamily: "monospace" }}>{s.action}</td>
                      <td style={{ padding: 6 }}>{s.ok ? "✓" : "✗"}</td>
                      <td style={{ padding: 6, wordBreak: "break-word" }}>{s.detail}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <style>{`@keyframes progressMove { from { background-position: 0 0; } to { background-position: 40px 0; } }`}</style>
    </main>
  );
}

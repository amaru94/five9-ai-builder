"use client";

import { useState, useEffect } from "react";

const MODULE_LABELS: Record<string, string> = {
  dispositions: "Dispositions",
  campaigns: "Campaigns",
  skills: "Skills",
  lists: "Lists",
  variables: "Variables",
  not_ready_codes: "Not ready codes",
  ivrs: "IVRs",
  campaign_profiles: "Campaign profiles",
  reports: "Reports",
  contact_fields: "Contact fields",
  dnc: "Domain DNC",
};

const PLACEHOLDERS: Record<string, string> = {
  dispositions: "Scenario 1: Callback — RedialNumber, useTimer false, agent confirm. Scenario 2: Final — FinalDisp, no redial. …",
  campaigns: "Scenario 1: Outbound list campaign — … Scenario 2: Inbound — …",
  skills: "How I create skills: name + description. Default routing …",
  lists: "How I create lists. Naming, columns …",
  variables: "Call variables / groups. When to use which …",
  not_ready_codes: "NotReady vs Logout. When I add each …",
  ivrs: "Naming CCRD-*, structure. Scenario 1: …",
  campaign_profiles: "Default profile settings. Dialing schedule, attempts …",
  reports: "How I configure or reference reports …",
  contact_fields: "Custom fields. Types, display. Scenario …",
  dnc:
    "Leave blank to use the built-in default (shown to the AI). Or override: how you handle domain DNC adds/removes, bulk limits, after-hours queue…",
};

type VersionItem = { id: string; content: string; createdAt: string };

export default function PlaybookAdmin() {
  const [modules, setModules] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openVersionsKey, setOpenVersionsKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetch("/api/admin/playbook", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          setError("admin_required");
          setLoading(false);
          return null;
        }
        if (!r.ok) return r.json().then((d) => ({ error: d?.error || "Server error" }));
        return r.json();
      })
      .then((data) => {
        if (data === null) return;
        if (data?.error) {
          setError(data.error);
          setModules({});
        } else {
          setModules(data?.modules ?? {});
          setError(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load playbook. Check the console.");
        setModules({});
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/playbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modules }),
      });
      if (!res.ok) setError("Save failed");
      else setError(null);
    } finally {
      setSaving(false);
    }
  }

  async function loadVersions(moduleKey: string) {
    setOpenVersionsKey(moduleKey);
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/admin/playbook/versions?moduleKey=${encodeURIComponent(moduleKey)}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      setVersions((data?.versions?.[moduleKey] ?? []) as VersionItem[]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restore(versionId: string) {
    setRestoring(true);
    try {
      const res = await fetch("/api/admin/playbook/versions/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.moduleKey) {
        const v = versions.find((x) => x.id === versionId);
        if (v) setModules((m) => ({ ...m, [data.moduleKey]: v.content }));
        setOpenVersionsKey(null);
      }
    } finally {
      setRestoring(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (error === "admin_required") {
    return <AdminLogin onSuccess={() => window.location.reload()} />;
  }

  const keys = Object.keys(MODULE_LABELS);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
          Define how you approach each area. Use scenarios (e.g. Scenario 1: … Scenario 2: …). The AI will propose builds that match and offer &quot;Build exactly like this&quot; or customize.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "transparent",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Admin logout
            </button>
          </form>
        </div>
      </div>

      {error && error !== "admin_required" && (
        <div style={{ padding: 10, background: "#1c1917", color: "#fca5a5", borderRadius: 8 }}>{error}</div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {keys.map((key) => (
          <div key={key} style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <label style={{ fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
                {MODULE_LABELS[key]}
              </label>
              <button
                type="button"
                onClick={() => loadVersions(key)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                Previous versions
              </button>
            </div>
            <textarea
              value={modules[key] ?? ""}
              onChange={(e) => setModules((m) => ({ ...m, [key]: e.target.value }))}
              placeholder={PLACEHOLDERS[key] ?? "Scenario 1: … Scenario 2: …"}
              rows={key === "dnc" ? 8 : 4}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#162032",
                color: "#e2e8f0",
                fontSize: 14,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            {openVersionsKey === key && (
              <div style={{ marginTop: 10, padding: 10, background: "#162032", borderRadius: 8, border: "1px solid #334155" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>Saved versions (most recent first)</div>
                {versionsLoading ? (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</div>
                ) : versions.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No previous versions yet. Save changes to create versions.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#e2e8f0" }}>
                    {versions.map((v) => (
                      <li key={v.id} style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: "#94a3b8" }}>{new Date(v.createdAt).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => restore(v.id)}
                          disabled={restoring}
                          style={{
                            padding: "2px 8px",
                            fontSize: 12,
                            borderRadius: 4,
                            border: "1px solid #2563eb",
                            background: "transparent",
                            color: "#60a5fa",
                            cursor: restoring ? "not-allowed" : "pointer",
                          }}
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setOpenVersionsKey(null)}
                  style={{ marginTop: 8, fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    if (res.ok) onSuccess();
    else setStatus("error");
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto", border: "1px solid #334155", borderRadius: 12, padding: 24, background: "#1e293b" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Admin login</div>
      <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
        Enter the admin password to edit the playbook (set ADMIN_PASSWORD in .env).
      </p>
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#162032",
            color: "#e2e8f0",
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            cursor: status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {status === "loading" ? "Checking…" : "Log in"}
        </button>
        {status === "error" && (
          <p style={{ color: "#fca5a5", fontSize: 13, marginTop: 10 }}>Invalid password.</p>
        )}
      </form>
    </div>
  );
}

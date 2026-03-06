"use client";

import { useMemo, useState } from "react";

type DC = "US" | "CA" | "UK" | "EU";

type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };

type CredsDraft = {
  dataCenter: DC;
  username: string;
  password: string; // only held until connect
};

type SessionCreds = {
  dataCenter: DC;
  username: string;
  encodedAuth: string;
};

function now() {
  return Date.now();
}

function extractXml(text: string) {
  const m = text.match(/```xml\n?([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function tsLabel(t: number) {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const SYSTEM_PROMPT = `You are a Five9 expert builder.

Rules:
- Ask clarifying questions BEFORE generating payloads.
- Ask at most 3 questions per turn.
- Never assume missing details.
- When ready to generate a payload, output EXACTLY one XML block in a fenced code block: \n\n\`\`\`xml\n...\n\`\`\`\n
- After the XML, include a short checklist of what will change.

Scope:
- Five9 Configuration SOAP API payloads (campaigns, variables, dispositions, profiles)
- Five9 IVR scripts (generate IVR XML only when all details are known)

Style:
- Use naming patterns: CCRD-* for main IVRs, CCRD-FS_* for foreign scripts.
- Prefer modular design: foreign scripts for language selection, HOOPS/callback, emergency.
`;

export default function Five9Builder({ workspaceId }: { workspaceId: string }) {
  const [draft, setDraft] = useState<CredsDraft>({ dataCenter: "US", username: "", password: "" });
  const [sessionCreds, setSessionCreds] = useState<SessionCreds | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Before we build anything, click **Connect** and enter your Five9 username + password (session only). Then tell me what you want to build.",
      ts: now(),
    },
  ]);
  const [input, setInput] = useState("");

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return messages[i].content;
    return "";
  }, [messages]);

  const latestXml = useMemo(() => extractXml(latestAssistant), [latestAssistant]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const nextMsgs: ChatMsg[] = [...messages, { role: "user", content: text, ts: now() }];
    setMessages(nextMsgs);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json().catch(() => ({}));
    const reply = data?.text || "(No response text returned.)";

    setMessages((m) => [...m, { role: "assistant", content: reply, ts: now() }]);
  }

  async function executeXml() {
    if (!latestXml) return;
    if (!sessionCreds) {
      alert("Connect to Five9 first.");
      return;
    }

    const title = "Execute SOAP/XML";

    // Log intent
    await fetch("/api/changes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, title, payloadXml: latestXml, ok: false }),
    }).catch(() => {});

    const res = await fetch("/api/five9/soap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataCenter: sessionCreds.dataCenter,
        username: sessionCreds.username,
        encodedAuth: sessionCreds.encodedAuth,
        xml: latestXml,
      }),
    });

    const responseText = await res.text();

    await fetch("/api/changes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title,
        payloadXml: latestXml,
        response: responseText,
        ok: res.ok,
      }),
    }).catch(() => {});

    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content:
          (res.ok ? "✅ Five9 API call executed successfully." : "⚠️ Five9 API call failed.") +
          "\n\n" +
          "```xml\n" +
          responseText.slice(0, 12000) +
          "\n```",
        ts: now(),
      },
    ]);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Builder Console</div>
          <span
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #0e1628",
              background: sessionCreds ? "#071a10" : "#120a0a",
              color: sessionCreds ? "#6de28a" : "#f08e8e",
            }}
          >
            {sessionCreds ? `Connected (${sessionCreds.dataCenter})` : "Not connected"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnGhost} onClick={() => setConnectOpen((v) => !v)}>
            {connectOpen ? "Close" : "Connect"}
          </button>
          <button
            style={{ ...btnPrimary, opacity: latestXml && sessionCreds ? 1 : 0.5 }}
            onClick={executeXml}
            disabled={!latestXml || !sessionCreds}
            title={!latestXml ? "No XML found in the last assistant message" : !sessionCreds ? "Connect first" : "Execute"}
          >
            Execute
          </button>
        </div>
      </div>

      {connectOpen && (
        <div style={{ border: "1px solid #0e1628", borderRadius: 12, padding: 14, background: "#040710" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <label style={lbl}>
              Data Center
              <select
                value={draft.dataCenter}
                onChange={(e) => setDraft((d) => ({ ...d, dataCenter: e.target.value as DC }))}
                style={inp}
              >
                <option value="US">US</option>
                <option value="CA">CA</option>
                <option value="UK">UK</option>
                <option value="EU">EU</option>
              </select>
            </label>
            <label style={lbl}>
              Username
              <input value={draft.username} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} style={inp} />
            </label>
            <label style={lbl}>
              Password (session only)
              <input
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                type="password"
                style={inp}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              style={btnPrimary}
              onClick={() => {
                const u = draft.username.trim();
                const p = draft.password;
                if (!u || !p) return alert("Username and password required.");
                const encodedAuth = btoa(`${u}:${p}`);
                setSessionCreds({ dataCenter: draft.dataCenter, username: u, encodedAuth });
                // wipe plaintext
                setDraft((d) => ({ ...d, password: "" }));
                setConnectOpen(false);
              }}
            >
              Save & Connect
            </button>
            <button
              style={btnGhost}
              onClick={() => {
                setSessionCreds(null);
                setDraft((d) => ({ ...d, password: "" }));
              }}
            >
              Disconnect
            </button>
            <div style={{ fontSize: 12, color: "#9da8be" }}>
              Password is never stored in DB. This session keeps only Base64 auth in memory.
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid #0e1628", borderRadius: 12, background: "#040710" }}>
        <div style={{ padding: 14, borderBottom: "1px solid #0e1628", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>Chat</div>
          <div style={{ fontSize: 12, color: "#9da8be" }}>Plan → Payload → Execute</div>
        </div>

        <div style={{ padding: 14, maxHeight: 520, overflow: "auto" }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#9da8be" }}>{tsLabel(m.ts)}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: m.role === "user" ? "#7eb8f7" : "#c9d1e0" }}>
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{m.content}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid #0e1628", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Describe what you want to build…"
            style={{ ...inp, flex: 1 }}
          />
          <button style={btnPrimary} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, color: "#9da8be" };

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #0e1628",
  background: "#040710",
  color: "#c9d1e0",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#1a3a8a,#2952d4)",
  color: "white",
  fontWeight: 800,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #0e1628",
  cursor: "pointer",
  background: "#040710",
  color: "#c9d1e0",
  fontWeight: 800,
};

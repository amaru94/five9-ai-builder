"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main style={{ fontFamily: "Inter, system-ui", maxWidth: 440, margin: "60px auto", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Create account</h1>
      <p style={{ color: "#9da8be", lineHeight: 1.6 }}>This creates a workspace and a default connection.</p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={inp} />
        <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Workspace name" style={inp} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inp} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8 chars)" type="password" style={inp} />

        <button
          style={btn}
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email, password, name: name || undefined, workspaceName: workspaceName || undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setLoading(false);
              return setError(data?.error || "Registration failed");
            }

            // Auto-login
            const login = await signIn("credentials", { email, password, redirect: false });
            setLoading(false);
            if (login?.error) return setError("Account created, but login failed. Try logging in.");
            router.push("/app");
          }}
        >
          {loading ? "Creating…" : "Create"}
        </button>

        {error && <div style={{ color: "#e05555", fontSize: 13 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 14, fontSize: 13, color: "#9da8be" }}>
        Already have an account? <a href="/login" style={{ color: "#7eb8f7" }}>Login</a>
      </div>
    </main>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #0e1628",
  background: "#040710",
  color: "#c9d1e0",
  outline: "none",
};

const btn: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#1a3a8a,#2952d4)",
  color: "white",
  fontWeight: 700,
};

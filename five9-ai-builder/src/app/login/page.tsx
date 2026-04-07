"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main style={{ fontFamily: "Inter, system-ui", maxWidth: 440, margin: "60px auto", padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Login</h1>
      <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>Sign in to your workspace.</p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inp} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" style={inp} />
        <button
          style={btn}
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            const res = await signIn("credentials", {
              email,
              password,
              redirect: false,
            });
            setLoading(false);
            if (res?.error) return setError("Invalid email or password");
            router.push("/app");
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 14, fontSize: 13, color: "#94a3b8" }}>
        New here? <a href="/register" style={{ color: "#60a5fa" }}>Create an account</a>
      </div>
    </main>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  background: "#162032",
  color: "#e2e8f0",
  outline: "none",
};

const btn: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#1e40af,#3b82f6)",
  color: "white",
  fontWeight: 700,
};

import Link from "next/link";

export default function Home() {
  return (
    <main style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: "48px", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, letterSpacing: ".02em" }}>Five9 AI Builder</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/login" style={{ color: "#7eb8f7" }}>Login</Link>
          <Link href="/register" style={{ color: "#7eb8f7" }}>Create account</Link>
        </div>
      </div>

      <p style={{ color: "#9da8be", lineHeight: 1.7, marginTop: 18 }}>
        Describe what you need in plain English. The assistant asks the same clarifying questions an expert Five9 consultant would,
        generates exact SOAP/XML payloads, and lets you preview + execute changes with an audit trail.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 24 }}>
        {["Campaigns", "Variables", "Profiles", "Dispositions", "IVR scripts"].map((x) => (
          <div key={x} style={{ border: "1px solid #0e1628", borderRadius: 12, padding: 18, background: "#040710" }}>
            <div style={{ fontWeight: 600 }}>{x}</div>
            <div style={{ fontSize: 13, color: "#9da8be", marginTop: 8, lineHeight: 1.6 }}>
              Build safely: plan → payload → execute.
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <Link
          href="/register"
          style={{
            display: "inline-block",
            padding: "12px 18px",
            background: "linear-gradient(135deg,#1a3a8a,#2952d4)",
            color: "white",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Get started
        </Link>
      </div>

      <p style={{ marginTop: 18, fontSize: 12, color: "#2d3f60", lineHeight: 1.6 }}>
        MVP defaults to session-only Five9 credentials (not stored). Upgrade to encrypted vault mode later.
      </p>
    </main>
  );
}

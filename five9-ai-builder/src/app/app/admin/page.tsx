import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import Link from "next/link";
import PlaybookAdmin from "@/components/PlaybookAdmin";

export default async function AdminPlaybookPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  return (
    <main style={{ fontFamily: "Inter, system-ui", padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/app"
            style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}
          >
            ← Builder
          </Link>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Admin</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Playbook — how I approach</div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <Link href="/app/admin/dnc" style={{ fontSize: 14, color: "#60a5fa" }}>
                Domain DNC bulk →
              </Link>
              <Link href="/app/admin/skills-migration" style={{ fontSize: 14, color: "#60a5fa" }}>
                Skill clone & user migration (CSV) →
              </Link>
            </div>
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <PlaybookAdmin />
    </main>
  );
}

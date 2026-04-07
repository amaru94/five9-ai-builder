import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDefaultWorkspaceForEmail } from "@/lib/workspace";
import Five9Builder from "@/components/Five9Builder";

export default async function AppPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const data = await getDefaultWorkspaceForEmail(session.user.email);
  if (!data) redirect("/register");

  return (
    <main style={{ fontFamily: "Inter, system-ui", padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Workspace</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{data.workspace.name}</div>
          </div>
          <Link
            href="/app/admin"
            style={{
              fontSize: 13,
              color: "#60a5fa",
              textDecoration: "none",
              padding: "6px 10px",
              border: "1px solid #334155",
              borderRadius: 8,
            }}
          >
            Admin (playbook)
          </Link>
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

      <div style={{ marginTop: 16 }}>
        <Five9Builder workspaceId={data.workspace.id} />
      </div>
    </main>
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
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
        <div>
          <div style={{ fontSize: 12, color: "#9da8be" }}>Workspace</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{data.workspace.name}</div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0e1628",
              background: "#040710",
              color: "#c9d1e0",
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

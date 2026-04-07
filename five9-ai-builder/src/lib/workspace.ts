import { prisma } from "@/lib/prisma";

export async function getDefaultWorkspaceForEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;
  return { user, workspace: membership.workspace, role: membership.role };
}

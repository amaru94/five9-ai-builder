import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import SkillMigrationForm from "./SkillMigrationForm";

export default async function SkillsMigrationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  return <SkillMigrationForm />;
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import DncBulkForm from "./DncBulkForm";

export default async function DncBulkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  return <DncBulkForm />;
}

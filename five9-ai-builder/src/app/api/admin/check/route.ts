import { NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/admin";

export async function GET() {
  const password = getAdminPassword();
  return NextResponse.json({
    configured: !!password,
    hint: password
      ? "ADMIN_PASSWORD is set. Use that exact value (no extra spaces) and restart the dev server if you just changed it."
      : "ADMIN_PASSWORD is not set. Add ADMIN_PASSWORD=yourpassword to .env.local and restart the dev server.",
  });
}

import { NextResponse } from "next/server";
import { getSuperAdminSession } from "@/lib/server/superadmin";

export async function GET() {
  const session = await getSuperAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: session.superAdmin });
}

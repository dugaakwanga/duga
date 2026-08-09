import { NextResponse } from "next/server";
import { COOKIE_NAMES } from "@duga/core";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAMES.SUPERADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

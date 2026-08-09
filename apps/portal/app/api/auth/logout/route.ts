import { NextResponse } from "next/server";
import { COOKIE_NAMES, cookieOptions } from "@duga/core";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAMES.AUTH_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}

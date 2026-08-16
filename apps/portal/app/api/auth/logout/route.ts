import { NextResponse } from "next/server";
import { COOKIE_NAMES, cookieOptions } from "@duga/core";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear the session cookie immediately — maxAge 0 plus a past expiry so the
  // browser drops it right away and the next navigation is a fresh signed-out page.
  response.cookies.set(COOKIE_NAMES.AUTH_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

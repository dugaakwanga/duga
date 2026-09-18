import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, checkRateLimit, clientIp, signSuperAdminToken } from "@duga/core/server";
import { cookieOptions, getJwtLifetimeSeconds, COOKIE_NAMES } from "@duga/core";

// Try a handful of common phone formats so "08133402684", "2348133402684",
// "+2348133402684" and "8133402684" all resolve to the same account.
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) return [];
  const out = new Set<string>([raw, digits]);
  if (digits.startsWith("234")) {
    out.add(`+${digits}`);
    out.add(`0${digits.slice(3)}`);
    out.add(digits.slice(3));
  } else if (digits.startsWith("0")) {
    out.add(`234${digits.slice(1)}`);
    out.add(`+234${digits.slice(1)}`);
  } else {
    out.add(`0${digits}`);
    out.add(`234${digits}`);
    out.add(`+234${digits}`);
  }
  return [...out];
}

// A real bcrypt hash of a value nobody will ever guess, compared against
// on every "account not found" path so that a nonexistent-identifier
// request costs the same bcrypt.compare() time as a real one — otherwise
// the fast/slow response gap tells an attacker whether an account exists
// at all, before they've supplied a single valid credential.
const DUMMY_HASH = "$2a$10$C6UzMDM.H6dfI/f/IKcEeOgQ5yb2c1IWJlY7RRgAyU9U.Y0e2P1O2";

export async function POST(request: NextRequest) {
  try {
    // Superadmin is the platform's highest-privilege account (cross-school
    // access) — rate-limited tighter than ordinary portal login, both by IP
    // and by the identifier being attempted, so rotating one doesn't defeat
    // the other.
    const ip = clientIp(request);
    const ipLimit = checkRateLimit(`superadmin-login:ip:${ip}`, 5, 15 * 60_000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }

    const body = await request.json();
    const identifier = String(body.username ?? body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
    }

    const idLimit = checkRateLimit(`superadmin-login:id:${identifier.toLowerCase()}`, 5, 15 * 60_000);
    if (!idLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(idLimit.retryAfterSeconds) } },
      );
    }

    // Lookup by username, email, or phone (with variants).
    const sa = await prisma.superAdmin.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: { equals: identifier.toLowerCase(), mode: "insensitive" } },
          ...phoneVariants(identifier).map((phone) => ({ phone })),
        ],
      },
    });
    // Always run bcrypt.compare, even against a dummy hash when no account
    // matched, so the response takes the same time either way — otherwise
    // the timing itself reveals whether the identifier is a real account.
    const valid = await bcrypt.compare(password, sa?.passwordHash ?? DUMMY_HASH);
    if (!sa || !valid) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    await prisma.superAdmin.update({ where: { id: sa.id }, data: { lastLoginAt: new Date() } });
    await prisma.superAdminActivity.create({
      data: { superAdminId: sa.id, action: "auth.login" },
    });

    const token = await signSuperAdminToken({ sub: sa.id, username: sa.username, name: sa.name, kind: "superadmin" });
    const response = NextResponse.json({
      ok: true,
      user: { id: sa.id, username: sa.username, name: sa.name },
    });
    response.cookies.set(COOKIE_NAMES.SUPERADMIN_COOKIE, token, cookieOptions(getJwtLifetimeSeconds(process.env.JWT_EXPIRES_IN_SUPERADMIN)));
    return response;
  } catch (e) {
    console.error("superadmin login error:", e);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}

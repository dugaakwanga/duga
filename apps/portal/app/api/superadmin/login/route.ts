import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { signSuperAdminToken, cookieOptions, getJwtLifetimeSeconds, COOKIE_NAMES } from "@duga/core";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.username ?? body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
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
    if (!sa) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, sa.passwordHash);
    if (!valid) {
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

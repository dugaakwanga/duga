import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { signSuperAdminToken, cookieOptions, getJwtLifetimeSeconds, COOKIE_NAMES } from "@duga/core";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
    }

    const sa = await prisma.superAdmin.findUnique({ where: { username } });
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

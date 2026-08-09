import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, logAudit } from "@duga/core/server";
import { signPortalToken, cookieOptions, getJwtLifetimeSeconds } from "@duga/core";
import { COOKIE_NAMES } from "@duga/core";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.email ?? body.identifier ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json({ ok: false, error: "Email, phone or staff ID and password are required" }, { status: 400 });
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { phone: identifier },
          { id: identifier },
        ],
      },
    });

    // Staff ID: numbers live on the Teacher profile, not the user row.
    if (!user) {
      const teacher = await prisma.teacher.findFirst({ where: { staffNumber: identifier } });
      if (teacher) user = await prisma.user.findUnique({ where: { id: teacher.userId } });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }
    if (user.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Account is suspended. Contact the school office." }, { status: 403 });
    }
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { platformStatus: true, name: true } });
    if (school && school.platformStatus !== "ACTIVE") {
      const message =
        school.platformStatus === "SHUT_DOWN"
          ? "This school platform has been shut down by the administrator. Contact support."
          : "This school platform is currently suspended. Contact the administrator.";
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    // Portal separation: admin & proprietor sign in via the admin portal;
    // students, parents & teachers sign in on the family portal.
    const bodyPortal = String(body.portal ?? "").toLowerCase();
    const isStaffRole = user.role === "OWNER" || user.role === "ADMIN";
    const requestedAdmin = bodyPortal === "admin";
    if (isStaffRole && !requestedAdmin) {
      return NextResponse.json({ ok: false, error: "Administrators and the proprietor sign in from the admin portal." }, { status: 403 });
    }
    if (!isStaffRole && requestedAdmin) {
      return NextResponse.json({ ok: false, error: "This is the school administration portal. Please sign in from the student & family portal instead." }, { status: 403 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await logAudit({ schoolId: user.schoolId, userId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

    const token = await signPortalToken({
      sub: user.id,
      schoolId: user.schoolId,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    });

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.role, schoolId: user.schoolId, email: user.email, mustChangePassword: user.mustChangePassword },
    });
    response.cookies.set(COOKIE_NAMES.AUTH_COOKIE, token, cookieOptions(getJwtLifetimeSeconds(process.env.JWT_EXPIRES_IN)));
    return response;
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}

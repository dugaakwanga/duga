import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, logAudit, checkRateLimit, clientIp } from "@duga/core/server";
import { signPortalToken, cookieOptions, getJwtLifetimeSeconds } from "@duga/core";
import { COOKIE_NAMES } from "@duga/core";

// Try a handful of common phone formats so "+2348030000000", "2348030000000",
// "08030000000" and "8030000000" all resolve to the same account.
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
    const rl = checkRateLimit(`login:${clientIp(request)}`, 10, 5 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many login attempts. Please try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const body = await request.json();
    const identifier = String(body.email ?? body.identifier ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json({ ok: false, error: "Email, phone or ID and password are required" }, { status: 400 });
    }

    // Lookup by email, phone (with variants) or internal user id.
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          ...phoneVariants(identifier).map((phone) => ({ phone })),
          { id: identifier },
        ],
      },
    });

    // Staff ID lives on the Teacher profile; admission number on the Student profile.
    if (!user) {
      const teacher = await prisma.teacher.findFirst({ where: { staffNumber: identifier } });
      if (teacher) user = await prisma.user.findUnique({ where: { id: teacher.userId } });
    }
    // Administrators and bursars carry their staff number on the Admin profile.
    if (!user) {
      const admin = await prisma.admin.findFirst({ where: { staffNumber: identifier } });
      if (admin) user = await prisma.user.findUnique({ where: { id: admin.userId } });
    }
    if (!user) {
      const student = await prisma.student.findFirst({
        where: { admissionNumber: { equals: identifier, mode: "insensitive" } },
      });
      if (student) user = await prisma.user.findUnique({ where: { id: student.userId } });
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
    const isStaffRole = user.role === "OWNER" || user.role === "ADMIN" || user.role === "BURSAR" || user.role === "SECURITY";
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
      email: user.email ?? "",
    });

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.role, schoolId: user.schoolId, email: user.email ?? "", mustChangePassword: user.mustChangePassword },
    });
    response.cookies.set(COOKIE_NAMES.AUTH_COOKIE, token, cookieOptions(getJwtLifetimeSeconds(process.env.JWT_EXPIRES_IN)));
    return response;
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}

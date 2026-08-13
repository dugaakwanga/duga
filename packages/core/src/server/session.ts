import { cookies } from "next/headers";
import { verifyPortalToken, COOKIE_NAMES, type PortalClaims } from "../auth";
import { prisma } from "./prisma";
import { isSchoolRole, assertPermission, ForbiddenError, type Role, type Permission } from "../roles";

export interface SessionUser {
  user: NonNullable<Awaited<ReturnType<typeof loadUser>>>;
  claims: PortalClaims;
}

async function loadUser(claims: PortalClaims) {
  return prisma.user.findUnique({
    where: { id: claims.sub },
    include: {
      student: true,
      // Keep authentication independent from optional teacher-profile fields.
      // This prevents a newly deployed profile migration from blocking login.
      teacher: {
        select: {
          id: true,
          userId: true,
          schoolId: true,
          staffNumber: true,
          specialty: true,
          designation: true,
        },
      },
      parent: { include: { students: { include: { student: { include: { classGroup: { include: { level: true } } } } } } } },
      admin: true,
    },
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAMES.AUTH_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyPortalToken(token);
  if (!claims) return null;
  const user = await loadUser(claims);
  if (!user || user.status !== "ACTIVE") return null;
  if (!isSchoolRole(user.role)) return null;
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { platformStatus: true } });
  if (!school || school.platformStatus !== "ACTIVE") return null;
  return { user, claims: { ...claims, role: user.role } };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new ForbiddenError("Authentication required");
  }
  return session;
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const session = await requireSession();
  assertPermission(session.user.role as Role, permission);
  return session;
}

// Owner or Admin only helper.
export async function requireStaff(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.user.role !== "OWNER" && session.user.role !== "ADMIN") {
    throw new ForbiddenError();
  }
  return session;
}

export async function requireOwner(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.user.role !== "OWNER") {
    throw new ForbiddenError("Only the proprietor can access this.");
  }
  return session;
}

export { assertPermission, ForbiddenError };

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

// A request can touch getSession multiple times (page layout + several data
// calls), and during a CBT burst many students' requests land in the same
// window — a short cache on the loaded user cuts repeat round trips without
// meaningfully risking staleness (role/status changes aren't second-to-second).
const SESSION_CACHE_TTL_MS = 5_000;
const sessionCache = new Map<string, { value: SessionUser | null; expiresAt: number }>();

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAMES.AUTH_COOKIE)?.value;
  if (!token) return null;

  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const claims = await verifyPortalToken(token);
  if (!claims) return null;

  // A momentary DB connection blip here shouldn't bounce a valid, logged-in
  // user out to "Authentication required" — retry once before giving up.
  let user: Awaited<ReturnType<typeof loadUser>>;
  try {
    user = await loadUser(claims);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
    user = await loadUser(claims);
  }

  let result: SessionUser | null = null;
  if (user && user.status === "ACTIVE" && isSchoolRole(user.role)) {
    let school;
    try {
      school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { platformStatus: true } });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
      school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { platformStatus: true } });
    }
    if (school && school.platformStatus === "ACTIVE") {
      result = { user, claims: { ...claims, role: user.role } };
    }
  }
  sessionCache.set(token, { value: result, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  // Bound the cache in long-lived (warm serverless / dev) processes — a plain
  // Map here would otherwise grow by one entry per distinct token forever.
  if (sessionCache.size > 500) {
    const now = Date.now();
    for (const [key, entry] of sessionCache) {
      if (entry.expiresAt <= now) sessionCache.delete(key);
    }
  }
  return result;
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

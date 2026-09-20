import { cookies } from "next/headers";
import { COOKIE_NAMES, type PortalClaims } from "../auth";
import { verifyPortalToken } from "./tokens";
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
          signatureUrl: true,
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
  // The user row and the school row don't depend on each other (the school
  // id is already in the JWT claims), so load them concurrently instead of
  // one after the other — this runs on every authenticated request, so the
  // saved round trip adds up across the whole app.
  const [user, school] = await Promise.all([
    loadUser(claims).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return loadUser(claims);
    }),
    prisma.school.findUnique({ where: { id: claims.schoolId }, select: { platformStatus: true } }).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return prisma.school.findUnique({ where: { id: claims.schoolId }, select: { platformStatus: true } });
    }),
  ]);

  // A token issued before the user's last password change is stale — even
  // though the JWT itself is still validly signed and unexpired, the
  // password that was compromised (or simply changed on purpose) shouldn't
  // keep an old session alive. Since sessions are stateless JWTs with no
  // server-side revocation list, this is what makes "change your password"
  // actually kick out anyone holding an older token.
  const tokenPredatesPasswordChange =
    !!user?.passwordChangedAt && !!claims.iat && user.passwordChangedAt.getTime() > claims.iat * 1000;

  let result: SessionUser | null = null;
  if (user && !tokenPredatesPasswordChange && user.status === "ACTIVE" && isSchoolRole(user.role) && school && school.platformStatus === "ACTIVE") {
    result = { user, claims: { ...claims, role: user.role } };
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

import { cookies } from "next/headers";
import { verifySuperAdminToken, COOKIE_NAMES, ForbiddenError } from "@duga/core";
import { prisma } from "@duga/core/server";

export interface SuperAdminSession {
  claims: NonNullable<Awaited<ReturnType<typeof verifySuperAdminToken>>>;
  superAdmin: {
    id: string;
    username: string;
    name: string;
  };
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const token = (await cookies()).get(COOKIE_NAMES.SUPERADMIN_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySuperAdminToken(token);
  if (!claims) return null;
  const sa = await prisma.superAdmin.findUnique({ where: { id: claims.sub } });
  if (!sa) return null;
  return { claims, superAdmin: { id: sa.id, username: sa.username, name: sa.name } };
}

export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await getSuperAdminSession();
  if (!session) throw new ForbiddenError("Super admin authentication required");
  return session;
}

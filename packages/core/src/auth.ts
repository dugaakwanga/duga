import { SignJWT, jwtVerify } from "jose";

const AUTH_COOKIE = "duga_token";
const SUPERADMIN_COOKIE = "duga_superadmin_token";

export const COOKIE_NAMES = { AUTH_COOKIE, SUPERADMIN_COOKIE } as const;

const encoder = new TextEncoder();

function secretFor(kind: "portal" | "superadmin"): Uint8Array {
  const raw =
    kind === "superadmin"
      ? process.env.JWT_SECRET_SUPERADMIN || process.env.JWT_SECRET
      : process.env.JWT_SECRET;
  if (!raw || raw === "change-me-super-secret") {
    throw new Error("JWT secret is not configured. Set JWT_SECRET in .env");
  }
  return encoder.encode(raw);
}

export interface PortalClaims {
  sub: string; // user id
  schoolId: string;
  role: string;
  name: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface SuperAdminClaims {
  sub: string;
  username: string;
  name: string;
  kind: "superadmin";
  iat?: number;
  exp?: number;
}

export async function signPortalToken(claims: PortalClaims): Promise<string> {
  const expires = process.env.JWT_EXPIRES_IN || "8h";
  return new SignJWT({ role: claims.role, schoolId: claims.schoolId, name: claims.name, email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secretFor("portal"));
}

export async function verifyPortalToken(
  token: string,
): Promise<PortalClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretFor("portal"));
    return {
      sub: payload.sub as string,
      schoolId: payload.schoolId as string,
      role: payload.role as string,
      name: payload.name as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function signSuperAdminToken(
  claims: SuperAdminClaims,
): Promise<string> {
  const expires = process.env.JWT_EXPIRES_IN_SUPERADMIN || "2h";
  return new SignJWT({ username: claims.username, name: claims.name, kind: "superadmin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secretFor("superadmin"));
}

export async function verifySuperAdminToken(
  token: string,
): Promise<SuperAdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretFor("superadmin"));
    if (payload.kind !== "superadmin") return null;
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      name: payload.name as string,
      kind: "superadmin",
    };
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getJwtLifetimeSeconds(expires: string | undefined): number {
  const raw = expires || "8h";
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return 8 * 3600;
  const n = parseInt(match[1] ?? "1", 10);
  switch (match[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return 8 * 3600;
  }
}

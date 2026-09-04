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

export interface GateClaims {
  sub: string; // studentId
  schoolId: string;
  kind: "gate";
}

// Printed on a student's ID card as a QR code — long-lived by design (an ID
// card isn't reprinted every term) and carries only an identity, never a
// permission; the gate scan endpoint re-checks the student's live status,
// class and school on every scan, so revocation is "deactivate the student,"
// not "expire the token."
export async function signGateToken(studentId: string, schoolId: string): Promise<string> {
  return new SignJWT({ schoolId, kind: "gate" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(studentId)
    .setIssuedAt()
    .setExpirationTime("1825d")
    .sign(secretFor("portal"));
}

export async function verifyGateToken(token: string): Promise<GateClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretFor("portal"));
    if (payload.kind !== "gate" || !payload.sub || !payload.schoolId) return null;
    return { sub: payload.sub as string, schoolId: payload.schoolId as string, kind: "gate" };
  } catch {
    return null;
  }
}

export interface ApplicationTestClaims {
  sub: string; // applicationId
  schoolId: string;
  kind: "application-test";
}

// Emailed/linked to an admissions applicant so they can take the school's
// entrance CBT with no portal account. Re-issued fresh any time (e.g. an
// admin resending the link), so nothing needs to be stored or revoked
// server-side — the applicant's status and the attempt's isSubmitted flag
// are the real gate, not the token itself.
export async function signApplicationTestToken(applicationId: string, schoolId: string): Promise<string> {
  return new SignJWT({ schoolId, kind: "application-test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(applicationId)
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretFor("portal"));
}

export async function verifyApplicationTestToken(token: string): Promise<ApplicationTestClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretFor("portal"));
    if (payload.kind !== "application-test" || !payload.sub || !payload.schoolId) return null;
    return { sub: payload.sub as string, schoolId: payload.schoolId as string, kind: "application-test" };
  } catch {
    return null;
  }
}

export interface GameInviteClaims {
  sub: string; // GameInvite id
  schoolId: string;
  kind: "game-invite";
}

// A student's "invite a friend" link to trial-play one game with no portal
// account. Short-lived (7 days is plenty for a friend to click it) — the real
// one-trial-per-email limit is enforced in application code, not by the token.
export async function signGameInviteToken(inviteId: string, schoolId: string): Promise<string> {
  return new SignJWT({ schoolId, kind: "game-invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(inviteId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretFor("portal"));
}

export async function verifyGameInviteToken(token: string): Promise<GameInviteClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretFor("portal"));
    if (payload.kind !== "game-invite" || !payload.sub || !payload.schoolId) return null;
    return { sub: payload.sub as string, schoolId: payload.schoolId as string, kind: "game-invite" };
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

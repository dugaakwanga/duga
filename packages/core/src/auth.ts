// Client-safe auth constants and types only — no secrets, no signing/
// verification logic. That lives in ./server/tokens.ts (server-only, never
// bundled for the browser). Keeping this split means a future change to the
// signing logic can't silently end up shipped to the client the way a single
// mixed file could.
const AUTH_COOKIE = "duga_token";
const SUPERADMIN_COOKIE = "duga_superadmin_token";

export const COOKIE_NAMES = { AUTH_COOKIE, SUPERADMIN_COOKIE } as const;

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

export interface GateClaims {
  sub: string; // studentId
  schoolId: string;
  kind: "gate";
}

export interface ApplicationTestClaims {
  sub: string; // applicationId
  schoolId: string;
  kind: "application-test";
}

export interface GameInviteClaims {
  sub: string; // GameInvite id
  schoolId: string;
  kind: "game-invite";
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

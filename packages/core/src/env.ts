// Shared environment access with sane defaults for development.

export function env(key: string, fallback?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return value;
}

export const envInt = (key: string, fallback: number): number => {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const envFloat = (key: string, fallback: number): number => {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const envBool = (key: string, fallback = false): boolean => {
  const raw = env(key);
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

export const schoolConfig = {
  get name() {
    return env("NEXT_PUBLIC_SCHOOL_NAME", "De Ultimate Glory Academy");
  },
  get shortName() {
    return env("NEXT_PUBLIC_SCHOOL_SHORT_NAME", "DUGA");
  },
  get phone() {
    return env("NEXT_PUBLIC_SCHOOL_PHONE", "");
  },
  get email() {
    return env("NEXT_PUBLIC_SCHOOL_EMAIL", "");
  },
  get address() {
    return env("NEXT_PUBLIC_SCHOOL_ADDRESS", "Akwanga, Nasarawa State, Nigeria");
  },
  get lat() {
    return envFloat("NEXT_PUBLIC_SCHOOL_LAT", 8.9123);
  },
  get lng() {
    return envFloat("NEXT_PUBLIC_SCHOOL_LNG", 8.4066);
  },
  get attendanceRadiusMeters() {
    return envInt("ATTENDANCE_RADIUS_METERS", 150);
  },
  get portalUrl() {
    return env("NEXT_PUBLIC_PORTAL_URL", "https://duga-portal.vercel.app");
  },
  get siteUrl() {
    return env("NEXT_PUBLIC_SITE_URL", "https://duga-web.vercel.app");
  },
};

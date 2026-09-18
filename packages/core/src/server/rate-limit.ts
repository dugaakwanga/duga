// Minimal in-memory, fixed-window rate limiter. Per serverless instance, not
// distributed — good enough as a basic abuse guard on a single free-tier
// deployment; not a substitute for a real distributed limiter at larger scale.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller can retry, only set when `allowed` is false. */
  retryAfterSeconds?: number;
}

/**
 * Returns whether `key` may proceed under `limit` calls per `windowMs`.
 * Callers should scope `key` to both the action and the actor, e.g.
 * `login:${ip}` or `submitTest:${userId}`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true };
}

// x-forwarded-for is set by the platform's edge/proxy, but nothing here
// proves a given deployment target strips a client-supplied value before
// appending its own — treat it as a best-effort identifier, not a hard
// guarantee. That's why callers protecting login endpoints should also rate
// limit by the identifier being attempted (see login/route.ts and
// superadmin/login/route.ts): an attacker who can rotate this header still
// can't rotate the account they're trying to break into.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

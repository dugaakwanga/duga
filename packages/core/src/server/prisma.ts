import { PrismaClient } from "@duga/db";

declare global {
  // eslint-disable-next-line no-var
  var __dugaPrisma: PrismaClient | undefined;
}

// Reuse a single Prisma client across hot-reloads in dev AND across warm
// serverless invocations in production — each fresh client opens its own
// connection pool, and Vercel reuses warm function instances between
// requests, so not caching here means one extra pool per "cold" invocation
// for no benefit and real risk of exhausting Supabase's pooler connections.
export const prisma =
  global.__dugaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

global.__dugaPrisma = prisma;

import { PrismaClient } from "@duga/db";

declare global {
  // eslint-disable-next-line no-var
  var __dugaPrisma: PrismaClient | undefined;
}

// Reuse a single Prisma client across hot-reloads in development.
export const prisma =
  global.__dugaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__dugaPrisma = prisma;
}

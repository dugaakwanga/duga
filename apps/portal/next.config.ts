import type { NextConfig } from "next";
import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";

// Belt-and-braces: regenerate the Prisma Client here, at the one point
// Next.js always runs before anything else (config module evaluation),
// regardless of what actually invoked the build (vercel.json's buildCommand,
// a Vercel dashboard build-command override, `npm run build`, or `next
// build` called directly — all of them load this file first). This exists
// because multiple deploys failed with "@prisma/client did not initialize
// yet" despite vercel.json running `prisma generate` and a postinstall
// script doing the same — neither's output ever appeared in the build log,
// so something in that pipeline was silently skipping both. Skipped when
// the generated client is already present and newer than the schema, so
// local `next dev` restarts stay fast.
(function ensurePrismaClientGenerated() {
  const schemaPath = path.join(__dirname, "../../packages/db/prisma/schema.prisma");
  const clientEntry = path.join(__dirname, "../../node_modules/.prisma/client/index.js");
  try {
    const needsGenerate =
      !fs.existsSync(clientEntry) || fs.statSync(clientEntry).mtimeMs < fs.statSync(schemaPath).mtimeMs;
    if (needsGenerate) {
      execSync(`npx prisma generate --schema "${schemaPath}"`, { stdio: "inherit", cwd: __dirname });
    }
  } catch (e) {
    console.error("[next.config.ts] Prisma Client generation failed:", e);
    throw e;
  }
})();

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@duga/ui", "@duga/core", "@duga/db"],
  experimental: {
    optimizePackageImports: ["@duga/ui"],
  },
  serverExternalPackages: ["@prisma/client", "firebase-admin"],
  // Belt-and-braces alongside the pageshow/bfcache check in PortalShell:
  // never let a browser or intermediate proxy cache an authenticated page,
  // so a stale signed-in view can't resurface after logout.
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }];
    // Deliberately no Content-Security-Policy here yet: this app embeds
    // Jitsi (live classes), Paystack checkout, Firebase Cloud Messaging,
    // Supabase/R2-hosted images, and a few other third-party origins — a
    // CSP tight enough to matter but wrong in even one directive would
    // silently break live payments or live classes for real students. Land
    // one deliberately, tested against every real integration, as a
    // separate, focused change rather than guessing one in here.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      // This portal is never legitimately embedded in another site's frame.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/portal/:path*", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
      { source: "/superadmin/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;

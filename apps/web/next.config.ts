import type { NextConfig } from "next";
import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";

// The contact API imports @duga/core/server, which initializes Prisma while
// Next collects route data. Generate the client while loading the config so
// this also works when a Vercel dashboard build-command override runs `next
// build` directly and bypasses package scripts or vercel.json.
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
  transpilePackages: ["@duga/ui", "@duga/core"],
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    optimizePackageImports: ["@duga/ui"],
  },
  // No CSP here yet, deliberately — same reasoning as apps/portal/next.config.ts:
  // this site embeds third-party fonts/media/forms, and a wrong directive
  // silently breaking the public marketing site is worse than the gap it'd
  // close. These headers are the safe, non-breaking subset.
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;

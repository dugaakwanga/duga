import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@duga/ui", "@duga/core"],
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

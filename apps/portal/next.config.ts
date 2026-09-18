import type { NextConfig } from "next";
import path from "node:path";

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

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@duga/ui", "@duga/core", "@duga/db"],
  experimental: {
    optimizePackageImports: ["@duga/ui"],
  },
  serverExternalPackages: ["@prisma/client"],
  // Belt-and-braces alongside the pageshow/bfcache check in PortalShell:
  // never let a browser or intermediate proxy cache an authenticated page,
  // so a stale signed-in view can't resurface after logout.
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }];
    return [
      { source: "/portal/:path*", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
      { source: "/superadmin/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;

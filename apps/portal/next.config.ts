import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@duga/ui", "@duga/core", "@duga/db"],
  experimental: {
    optimizePackageImports: ["@duga/ui"],
  },
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;

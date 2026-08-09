import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@duga/ui", "@duga/core"],
  experimental: {
    optimizePackageImports: ["@duga/ui"],
  },
};

export default nextConfig;

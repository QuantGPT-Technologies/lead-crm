import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and behind login, so nothing is statically cached.
  serverExternalPackages: ["firebase-admin"],
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

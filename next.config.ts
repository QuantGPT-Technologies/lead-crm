import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages remain private and dynamic; only scoped read data uses explicit short-lived caches.
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Menu photos for AI import are sent to a server action (resized in the browser first).
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Evidence uploads go through a server action; files are capped at 4 MB in the action itself.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;

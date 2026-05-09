import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow blob URLs for local image previews
    remotePatterns: [],
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

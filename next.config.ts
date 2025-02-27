import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Using App Router by default in Next.js 13+
  eslint: {
    // Only use this temporarily to get your app deployed
    ignoreDuringBuilds: true,
  }
};

export default nextConfig;

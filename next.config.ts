import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;

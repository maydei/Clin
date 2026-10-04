import type { NextConfig } from "next";
const nextConfig: NextConfig = {

  devIndicators: false,
  poweredByHeader: false,
  experimental: { optimizePackageImports: ["lucide-react"] },
};
export default nextConfig;


import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Disabling optimization for netlify static files natively
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
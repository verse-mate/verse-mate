import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for static landing page
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },

  // Asset optimization
  assetPrefix: process.env.NODE_ENV === "production" ? undefined : "",

  // Note: Redirects don't work with static export
  // Use JavaScript navigation instead (see navigation.ts)
};

export default nextConfig;

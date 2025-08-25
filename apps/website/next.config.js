/** @type {import('next').NextConfig} */
const nextConfig = {
  // Re-enable static export for production
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

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed output: "export" to enable SSR on Cloudflare Workers
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep image optimization settings for Workers
  images: {
    unoptimized: true,
  },
  // Environment variables available at build time
  env: {
    API_URL: process.env.API_URL || "https://api.verse-mate.apegro.dev",
    NEXT_PUBLIC_ASK_VERSE_MATE:
      process.env.NEXT_PUBLIC_ASK_VERSE_MATE || "false",
  },
};

export default nextConfig;

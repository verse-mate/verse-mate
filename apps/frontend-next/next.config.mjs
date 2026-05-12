import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Using standalone output mode for OpenNext adapter
  output: "standalone",
  // Pin Turbopack workspace root to the verse-mate monorepo root so it
  // picks repos/verse-mate/bun.lock instead of an outer lockfile (e.g.
  // specwise-verse-mate/bun.lock). Silences the "multiple lockfiles
  // detected" warning emitted on first dev run.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
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
    API_URL: process.env.API_URL || "https://api.versemate.org",
  },
  // Headers for .well-known files (Universal Links & App Links)
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },
    ];
  },
  transpilePackages: ["@verse-mate/frontend-base"],
};

export default nextConfig;

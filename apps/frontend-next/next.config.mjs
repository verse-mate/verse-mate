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
  // Keep image optimization settings for Workers
  images: {
    unoptimized: true,
  },
  // Environment variables available at build time
  env: {
    API_URL: process.env.API_URL || "https://api.versemate.org",
  },
  transpilePackages: ["@verse-mate/frontend-base"],
};

export default nextConfig;

import withPWA from "@ducanh2912/next-pwa";

const cacheLoggingPlugin = {
  cacheKeyWillBeUsed: async ({ request, mode }) => {
    console.log(`[SW Cache] ${mode} request for: ${request.url}`);
    return request;
  },
  cachedResponseWillBeUsed: async ({ request, cachedResponse, cacheName }) => {
    if (cachedResponse) {
      console.log(
        `[SW Cache HIT] 🎯 Serving from cache "${cacheName}": ${request.url}`,
      );
    }
    return cachedResponse;
  },
  requestWillFetch: async ({ request }) => {
    console.log(`[SW Network] 🌐 Making network request: ${request.url}`);
    return request;
  },
  cacheDidUpdate: async ({ request, cacheName }) => {
    console.log(
      `[SW Cache UPDATE] 🔄 Cache "${cacheName}" updated for: ${request.url}`,
    );
  },
  cacheWillUpdate: async ({ request, response }) => {
    // Only cache successful responses
    if (response.status === 200) {
      console.log(
        `[SW Cache] ✅ Will cache successful response for: ${request.url}`,
      );
      return response;
    }
    console.log(
      `[SW Cache] ❌ Skipping cache for non-200 response (${response.status}): ${request.url}`,
    );
    return null;
  },
  fetchDidFail: async ({ request, error }) => {
    console.log(
      `[SW Network FAIL] ❌ Network request failed for: ${request.url}`,
    );
    console.log(
      `[SW Network FAIL] 🔍 Error: ${error?.message || "Unknown error"}`,
    );
    console.log(
      "[SW Network FAIL] 💾 Will attempt to serve from cache if available",
    );
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Using standalone output mode for OpenNext adapter
  output: "standalone",
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
    NEXT_PUBLIC_ASK_VERSE_MATE:
      process.env.NEXT_PUBLIC_ASK_VERSE_MATE || "false",
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

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true, // Automatic service worker registration
  skipWaiting: true,
  cleanupOutdatedCaches: true, // Important: clean up old caches
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /.*\/bible\/books.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "bible-books-cache",
          plugins: [cacheLoggingPlugin],
          matchOptions: {
            ignoreVary: true,
          },
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /.*\/bible\/testaments.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "bible-testaments-cache",
          plugins: [cacheLoggingPlugin],
          matchOptions: {
            ignoreVary: true,
          },
          expiration: {
            maxEntries: 5,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /.*\/bible\/book\/\d+\/\d+.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "bible-chapters-cache",
          plugins: [cacheLoggingPlugin],
          matchOptions: {
            ignoreVary: true,
          },
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          networkTimeoutSeconds: 5,
        },
      },
      {
        urlPattern: /.*\/bible\/book\/explanation\/\d+\/\d+.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "bible-explanations-cache",
          plugins: [cacheLoggingPlugin],
          matchOptions: {
            ignoreVary: true,
          },
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          networkTimeoutSeconds: 8,
        },
      },
      {
        urlPattern: /.*\/bible\/book\/.*conversations-history.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "chat-history-cache",
          plugins: [cacheLoggingPlugin],
          matchOptions: {
            ignoreVary: true,
          },
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 2 * 60 * 60, // 2 hours
          },
        },
      },
      {
        urlPattern: /^https?:\/\/localhost:3000\/.*$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "local-api-cache",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-cache",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-font-assets",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-image-assets",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        urlPattern: /\/_next\/static.+\.js$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-js-assets",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        urlPattern: /\/_next\/static.+\.css$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-css-assets",
          plugins: [cacheLoggingPlugin],
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
    ],
  },
})(nextConfig);

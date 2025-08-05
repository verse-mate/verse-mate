// Cloudflare Workers ES Module entry point for Next.js app
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

// ES Module export with fetch handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // Handle static assets first
      if (isStaticAsset(url.pathname)) {
        // Create event-like object for KV asset handler
        const event = {
          request,
          waitUntil: (promise) => ctx.waitUntil(promise),
        };

        return await getAssetFromKV(event, {
          cacheControl: {
            bypassCache: false,
            edgeTTL: 2 * 60 * 60 * 24, // 2 days
            browserTTL: 60 * 60 * 24, // 1 day
          },
        });
      }

      // Handle API routes
      if (url.pathname.startsWith("/api/")) {
        return handleAPIRoute(request, url, env);
      }

      // Handle Next.js pages
      return handleNextPage(request, url, ctx);
    } catch (e) {
      // Fall back to serving index.html for client-side routing
      if (e.status === 404) {
        const event = {
          request,
          waitUntil: (promise) => ctx.waitUntil(promise),
        };

        return getAssetFromKV(event, {
          mapRequestToAsset: (req) =>
            new Request(`${url.origin}/index.html`, req),
        });
      }

      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

function isStaticAsset(pathname) {
  // Check if the path is for a static asset
  const staticExtensions = [
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
  ];
  return (
    staticExtensions.some((ext) => pathname.endsWith(ext)) ||
    pathname.startsWith("/_next/static/")
  );
}

async function handleAPIRoute(request, url, env) {
  // Forward API requests to your backend
  const apiUrl = `${env.API_URL}${url.pathname}${url.search}`;

  const apiRequest = new Request(apiUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return fetch(apiRequest);
}

async function handleNextPage(request, url, ctx) {
  // For SSG pages, serve the pre-built HTML
  try {
    const htmlPath =
      url.pathname === "/" ? "/index.html" : `${url.pathname}.html`;

    const event = {
      request,
      waitUntil: (promise) => ctx.waitUntil(promise),
    };

    return await getAssetFromKV(event, {
      mapRequestToAsset: (req) => new Request(`${url.origin}${htmlPath}`, req),
    });
  } catch (e) {
    // Fall back to index.html for client-side routing
    const event = {
      request,
      waitUntil: (promise) => ctx.waitUntil(promise),
    };

    return getAssetFromKV(event, {
      mapRequestToAsset: (req) => new Request(`${url.origin}/index.html`, req),
    });
  }
}

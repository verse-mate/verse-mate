/**
 * Cloudflare Worker for serving VerseMate Lovable app (Vite SPA)
 *
 * Unlike the website worker (which looks for per-directory index.html files),
 * this worker always falls back to the root /index.html for any non-asset
 * request, letting React Router handle client-side routing.
 */

export default {
  async fetch(request, env) {
    // Try to serve the static asset first
    const response = await env.ASSETS.fetch(request);

    // If the asset was found, return it
    if (response.status !== 404) {
      return response;
    }

    // For paths without file extensions, serve root /index.html (SPA fallback)
    const url = new URL(request.url);
    if (!url.pathname.includes(".")) {
      const indexRequest = new Request(
        new URL("/index.html", request.url).toString(),
        request,
      );
      return env.ASSETS.fetch(indexRequest);
    }

    // For missing files with extensions (e.g. /missing.js), return 404
    return response;
  },
};

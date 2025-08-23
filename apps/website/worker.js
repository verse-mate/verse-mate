/**
 * Cloudflare Worker for serving static website assets
 * This minimal worker leverages Cloudflare's built-in static asset serving
 */

export default {
  async fetch(request, env, ctx) {
    // Try to serve the static asset first
    const response = await env.ASSETS.fetch(request);
    
    // If successful, return the response
    if (response.status !== 404) {
      return response;
    }
    
    // Handle 404s - try index.html for client-side routing
    const url = new URL(request.url);
    
    // For paths without extensions, try serving index.html from that directory
    if (!url.pathname.includes('.')) {
      const indexPath = url.pathname.endsWith('/') 
        ? `${url.pathname}index.html`
        : `${url.pathname}/index.html`;
      
      const indexRequest = new Request(new URL(indexPath, request.url).toString(), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      
      if (indexResponse.status !== 404) {
        return indexResponse;
      }
    }
    
    // If still 404, return the original 404 response
    return response;
  },
};
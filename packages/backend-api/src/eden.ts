import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

export const fetcher = async (
  url: string | URL | Request,
  init?: RequestInit,
) => {
  // Build URL robustly (supports relative paths and Request objects)
  const original =
    url instanceof Request
      ? new URL(url.url)
      : new URL(url.toString(), window.location.origin);

  // Preserve pathname + query (ex.: /books?limit=10&page=2)
  const pathWithQuery = `${original.pathname}${original.search}`;

  // Try to read access token from cookies in browser
  let authHeader: Record<string, string> = {};
  try {
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/(?:^|; )accessToken=([^;]+)/);
      if (match?.[1]) {
        const token = decodeURIComponent(match[1]);
        if (token) {
          authHeader = { Authorization: `Bearer ${token}` };
        }
      }
    }
  } catch {}

  return fetch(`${$env.get().apiUrl}${pathWithQuery}`, {
    ...init,
    headers: {
      ...{ "Access-Control-Allow-Origin": "*" },
      ...authHeader,
      ...(init?.headers as any),
    },
  });
};

export const api = treaty<App>($env.get().apiUrl, {
  fetcher,
  onResponse(response) {
    // In development, don't auto-redirect on 401 so callers can implement fallbacks
    if (response.status === 401) {
      if (process.env.NODE_ENV !== "development") {
        window.location.href = "/logout";
      }
    }
  },
});

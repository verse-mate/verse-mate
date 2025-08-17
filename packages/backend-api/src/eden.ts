import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

export const fetcher = async (
  url: string | URL | Request,
  init?: RequestInit,
) => {
  // Ensure we preserve both pathname and search/query string
  const u = url instanceof Request ? new URL(url.url) : new URL(url);
  const full = `${$env.get().apiUrl}${u.pathname}${u.search}`;

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

  return fetch(full, {
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

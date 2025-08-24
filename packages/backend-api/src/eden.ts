import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

const getAccessToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const headersToObject = (h: Headers | Record<string, string> | undefined) => {
  if (!h) return {};
  if (typeof (h as any).forEach === "function" && h instanceof Headers) {
    return Object.fromEntries((h as Headers).entries());
  }
  return h as Record<string, string>;
};

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

  const token = getAccessToken();
  const initHeadersObj = headersToObject(init?.headers as any);
  const hasAuthHeader =
    typeof (initHeadersObj as any).authorization === "string" ||
    typeof (initHeadersObj as any).Authorization === "string";

  const finalHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    ...initHeadersObj,
  };

  if (!hasAuthHeader && token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  return fetch(`${$env.get().apiUrl}${pathWithQuery}`, {
    ...init,
    headers: finalHeaders,
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

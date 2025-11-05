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

const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
  const original =
    url instanceof Request
      ? new URL(url.url)
      : new URL(url.toString(), window.location.origin);

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
  fetcher: fetcher as typeof fetch,
  onResponse(response) {
    if (typeof window === "undefined") return;
    if (response.status !== 401) return;

    const urlStr = response.url || "";
    const isCurrentAuthRoute = [
      "/login",
      "/signup",
      "/forgot-password",
      "/logout",
    ].some((p) => window.location.pathname.startsWith(p));

    const isAuthEndpoint =
      urlStr.includes("/auth/login") ||
      urlStr.includes("/auth/signup") ||
      urlStr.includes("/auth/forgot-password");

    let sameOrigin = false;
    try {
      const apiOrigin = new URL($env.get().apiUrl).origin;
      const respOrigin = new URL(urlStr).origin;
      sameOrigin = respOrigin === apiOrigin;
    } catch {
      sameOrigin = false;
    }

    if (
      !isAuthEndpoint &&
      sameOrigin &&
      !isCurrentAuthRoute &&
      window.location.pathname !== "/logout"
    ) {
      window.location.href = "/logout";
    }
  },
});

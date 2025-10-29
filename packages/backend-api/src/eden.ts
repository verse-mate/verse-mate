import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

const getAccessToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getRefreshToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)refreshToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const setAccessToken = (token: string) => {
  if (typeof document === "undefined") return;
  // Set cookie for 15 minutes (matching backend)
  document.cookie = `accessToken=${encodeURIComponent(token)}; path=/; max-age=${15 * 60}; SameSite=Strict`;
};

const setRefreshToken = (token: string) => {
  if (typeof document === "undefined") return;
  // Set cookie for 90 days (matching backend)
  document.cookie = `refreshToken=${encodeURIComponent(token)}; path=/; max-age=${90 * 24 * 60 * 60}; SameSite=Strict`;
};

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      const response = await fetch(`${$env.get().apiUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Refresh token is invalid or expired
        return null;
      }

      const data = await response.json();
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        // Update refresh token if a new one was provided
        if (data.refreshToken) {
          setRefreshToken(data.refreshToken);
        }
        return data.accessToken;
      }

      return null;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const headersToObject = (h: Headers | Record<string, string> | undefined) => {
  if (!h) return {};
  if (typeof (h as any).forEach === "function" && h instanceof Headers) {
    return Object.fromEntries((h as Headers).entries());
  }
  return h as Record<string, string>;
};

const fetcher = async (
  url: string | URL | Request,
  init?: RequestInit,
  retryCount = 0,
): Promise<Response> => {
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

  const response = await fetch(`${$env.get().apiUrl}${pathWithQuery}`, {
    ...init,
    headers: finalHeaders,
  });

  // If 401 and not already retrying, attempt token refresh
  if (response.status === 401 && retryCount === 0) {
    // Don't refresh on auth endpoints themselves
    if (
      !pathWithQuery.includes("/auth/login") &&
      !pathWithQuery.includes("/auth/signup") &&
      !pathWithQuery.includes("/auth/refresh")
    ) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        // Retry the request with the new token
        finalHeaders.Authorization = `Bearer ${newToken}`;
        return fetch(`${$env.get().apiUrl}${pathWithQuery}`, {
          ...init,
          headers: finalHeaders,
        });
      }
    }
  }

  return response;
};

export const api = treaty<App>($env.get().apiUrl, {
  fetcher: fetcher as typeof fetch,
  onResponse(response) {
    // Only redirect to logout if refresh also failed (fetcher already tried refresh)
    if (response.status === 401 && !getRefreshToken()) {
      window.location.href = "/logout";
    }
  },
});

// Export helper functions for managing auth tokens
export const authHelpers = {
  setTokens: (accessToken: string, refreshToken?: string) => {
    setAccessToken(accessToken);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }
  },
  clearTokens: () => {
    if (typeof document === "undefined") return;
    document.cookie =
      "accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie =
      "refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  },
  getAccessToken,
  getRefreshToken,
};

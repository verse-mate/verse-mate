import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

/**
 * Reads the current access-token cookie. Exported so raw-fetch hooks
 * (e.g. the audio poll — br-audio-017 exception) can set the same
 * Authorization header that the Eden fetcher attaches.
 */
export const getAccessToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getRefreshToken = (): string | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)refreshToken=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token;
};

const setAccessToken = (token: string) => {
  if (typeof document === "undefined") return;
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secureAttr = isSecure ? "; Secure" : "";
  // Set cookie for 15 minutes (matching backend)
  document.cookie = `accessToken=${encodeURIComponent(token)}; path=/; max-age=${15 * 60}; SameSite=Lax${secureAttr}`;
};

const setRefreshToken = (token: string) => {
  if (typeof document === "undefined") return;
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secureAttr = isSecure ? "; Secure" : "";
  // Set cookie for 90 days (matching backend)
  // Use SameSite=Lax to ensure token is available during navigation from external sites
  document.cookie = `refreshToken=${encodeURIComponent(token)}; path=/; max-age=${90 * 24 * 60 * 60}; SameSite=Lax${secureAttr}`;
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
        authHelpers.clearTokens();
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

  const apiBase = new URL($env.get().apiUrl);
  const targetUrl = new URL(`${$env.get().apiUrl}${pathWithQuery}`);

  const response = await fetch(targetUrl.toString(), {
    ...init,
    headers: finalHeaders,
  });

  // If 401 and not already retrying, attempt token refresh
  // Only refresh for our API host to prevent cross-origin refresh attempts
  if (
    response.status === 401 &&
    retryCount === 0 &&
    targetUrl.host === apiBase.host
  ) {
    // Don't refresh on auth endpoints themselves
    if (
      !pathWithQuery.includes("/auth/login") &&
      !pathWithQuery.includes("/auth/signup") &&
      !pathWithQuery.includes("/auth/refresh")
    ) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        // Retry the request with the new token using fetcher to track retry count
        const retryHeaders = {
          ...finalHeaders,
          Authorization: `Bearer ${newToken}`,
        };
        return fetcher(url, { ...init, headers: retryHeaders }, retryCount + 1);
      }
    }
  }

  return response;
};

export const api = treaty<App>($env.get().apiUrl, {
  fetcher: fetcher as typeof fetch,
  onResponse(response) {
    // Skip redirect for auth endpoints to avoid loops
    const url = response.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/signup") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/forgot-password");

    // Only redirect to logout if refresh also failed (fetcher already tried refresh)
    if (response.status === 401 && !getRefreshToken() && !isAuthEndpoint) {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      if (currentPath !== "/logout") {
        window.location.href = "/logout";
      }
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

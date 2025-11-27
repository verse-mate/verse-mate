import { api } from "backend-api";
import { parseCookies } from "nookies";
import { useCallback, useEffect, useState } from "react";
import { ACCESS_TOKEN_COOKIE } from "../auth/lib";
import { deleteCookie } from "../utils/auth-utils";
import type { UserSession } from "./session";

export const userSession = () => {
  const { accessToken, refreshToken } = parseCookies();
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(
    async (forceRefresh = false) => {
      // Try to fetch if we have EITHER token.
      // If only refreshToken exists, this request will 401, then eden.ts will refresh and retry.
      if ((accessToken || refreshToken) && (!session || forceRefresh)) {
        try {
          // We send Authorization header only if accessToken exists.
          // If it doesn't, fetcher in eden.ts will handle the 401 flow using refreshToken.
          const headers: Record<string, string> = {};
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }

          const response = await api.auth.session.get({
            headers,
          });

          if (response.error) {
            throw response.error;
          }
          if (!response.data || response.data instanceof Error) {
            throw response.data instanceof Error
              ? response.data
              : new Error("No session data received");
          }
          setSession(response.data);
          setLoading(false);
          return response.data;
        } catch (error) {
          console.error("Error fetching user session", error);
          try {
            deleteCookie(ACCESS_TOKEN_COOKIE);
            if (typeof window !== "undefined") {
              try {
                localStorage.removeItem("accessToken");
              } catch {}
              // Only redirect if we REALLY failed (meaning refresh also failed/didn't happen)
              // But wait, if refresh succeeded inside api.auth.session.get (via eden),
              // we wouldn't be in this catch block unless the *retried* request also failed.
              Promise.resolve().then(() => window.location.replace("/login"));
            }
          } catch {}
          setSession(null);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    },
    [accessToken, refreshToken, session],
  );

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { session, loading, fetchSession };
};

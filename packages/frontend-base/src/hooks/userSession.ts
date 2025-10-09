import { api } from "backend-api";
import { parseCookies } from "nookies";
import { useCallback, useEffect, useState } from "react";
import { ACCESS_TOKEN_COOKIE } from "../auth/lib";
import { deleteCookie } from "../utils/auth-utils";
import type { UserSession } from "./session";

export const userSession = () => {
  const { accessToken } = parseCookies();
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(
    async (forceRefresh = false) => {
      if (accessToken && (!session || forceRefresh)) {
        try {
          const response = await api.auth.session.get({
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          if (response.data instanceof Error) {
            throw response.data;
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
    [accessToken, session],
  );

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { session, loading, fetchSession };
};

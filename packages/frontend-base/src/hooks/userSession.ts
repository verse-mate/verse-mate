import { api } from "backend-api";
import { parseCookies } from "nookies";
import { useCallback, useEffect, useState } from "react";

export const userSession = () => {
  const { accessToken } = parseCookies();
  const [session, setSession] = useState<UserSession>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    if (accessToken && !session) {
      try {
        const response = await api.auth.session.get({
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        setSession(response.data);
        setLoading(false);
        return response.data;
      } catch (error) {
        console.error("Error fetching user session", error);
        setSession(null);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [accessToken, session]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { session, loading, fetchSession };
};

"use client";

import { AnalyticsEvent, analytics } from "frontend-base/src/analytics";
import { ACCESS_TOKEN_COOKIE } from "frontend-base/src/auth/lib";
import { deleteCookie } from "frontend-base/src/utils/auth-utils";
import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    try {
      // Track LOGOUT event before clearing cookies
      analytics.track(AnalyticsEvent.LOGOUT, {});

      // Reset analytics to clear user identity
      analytics.reset();

      deleteCookie(ACCESS_TOKEN_COOKIE);
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("accessToken");
        } catch {}
        window.location.replace("/login");
      }
    } catch {
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  }, []);

  return null;
}

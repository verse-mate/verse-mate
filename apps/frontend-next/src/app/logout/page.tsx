"use client";

import { ACCESS_TOKEN_COOKIE } from "frontend-base/src/auth/lib";
import { deleteCookie } from "frontend-base/src/utils/auth-utils";
import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    try {
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

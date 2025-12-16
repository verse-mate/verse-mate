"use client";

import { api } from "backend-api";
import { safePromise } from "./safe-promise";

const isBrowser = typeof window !== "undefined";

const redirect = (href: string) => {
  if (isBrowser) {
    window.location.href = href;
  }
};

export async function getUserLogged() {
  const accessToken = localStorage?.getItem("accessToken");

  if (!accessToken) {
    return undefined;
  }

  const [data, error] = await safePromise(api.user.me.get());

  if (error) {
    console.error(error);
  }

  if (data?.data instanceof Error || !data?.data?.id) {
    localStorage?.removeItem("accessToken");
  }

  return data?.data instanceof Error ? undefined : data?.data;
}

export function checkUserLogged() {
  const accessToken = localStorage?.getItem("accessToken");

  return Boolean(accessToken);
}

// export async function protectRoute() {
//   const isLoggedIn = checkUserLogged();

//   if (!isLoggedIn) {
//     redirect("/login");
//   }

//   return isLoggedIn;
// }

export async function alreadyLoggedRedirect() {
  if (checkUserLogged()) {
    return redirect("/");
  }
}

export async function alreadyEmailConfirmedRedirect() {
  const me = await getUserLogged();
  if (!me || me instanceof Error) {
    return redirect("/login");
  }

  const isVerified = Boolean(me?.emailVerified);
  if (isVerified) {
    return redirect("/");
  }
}

export function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export function getCookie(name: string): string | null {
  return document.cookie.split("; ").reduce((r, v) => {
    const parts = v.split("=");
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, "");
}

export function deleteCookie(name: string) {
  setCookie(name, "", -1);
}

/**
 * Decodes a JWT token to extract the payload.
 * Returns null if decoding fails.
 */
export function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

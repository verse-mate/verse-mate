import { z } from "zod";

export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";

export const regex = {
  email:
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
  phone: /[\D+]/g,
  locale: /[\w]+/gm,
  url: /[\w]+/gm,

  PASSWORD_REGEX: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,

  PASSWORD_MIN_LENGTH_REGEX: /^.{8,}$/,
  PASSWORD_AT_LEAST_ONE_SPECIAL: /[@$!%*#?&]/,
  PASSWORD_AT_LEAST_ONE_NUMBER: /[\d]/,
  PASSWORD_AT_LEAST_ONE_LETTER: /[a-zA-Z]/,
};

export const zodPassword = z
  .string()
  .min(1, "Required.")
  .regex(regex.PASSWORD_REGEX, "Password does not match the requirements.")
  .max(64, "Max length");

export const zodEmail = z
  .string()
  .min(1, "Required.")
  .max(64, "Max length")
  .email({ message: "Invalid email." })
  .toLowerCase();

export const SUPPORT_EMAIL = "support@my-domain.com";

// ==================== SSO CALLBACK UTILITIES ====================

/**
 * Represents the result of parsing SSO callback URL parameters.
 * Either contains tokens on success or error information on failure.
 */
export interface SSOCallbackResult {
  success: boolean;
  code?: string;
  accessToken?: string;
  verified?: boolean;
  error?: string;
  errorDescription?: string;
}

/**
 * SSO error codes returned from the backend callback
 */
export type SSOErrorCode =
  | "access_denied"
  | "invalid_state"
  | "missing_code"
  | "auth_failed"
  | "user_cancelled_authorize"
  | string;

/**
 * User-friendly error messages for SSO error codes
 */
export const SSO_ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "You denied access to your account. Please try again and allow access to continue.",
  invalid_state: "Your sign-in session has expired. Please try again.",
  missing_code: "The sign-in process was interrupted. Please try again.",
  auth_failed:
    "Authentication failed. Please try again or contact support if the problem persists.",
  user_cancelled_authorize:
    "You cancelled the sign-in process. Please try again when ready.",
  default: "Something went wrong during sign-in. Please try again.",
};

/**
 * Parse SSO callback URL parameters from the current URL.
 * Extracts tokens on success or error information on failure.
 *
 * @param searchParams - URL search parameters string or URLSearchParams object
 * @returns SSOCallbackResult with tokens or error information
 */
export function parseSSOCallbackParams(
  searchParams: string | URLSearchParams,
): SSOCallbackResult {
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams;

  const code = params.get("code");
  const accessToken = params.get("accessToken");
  const verified = params.get("verified");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (code) {
    return { success: true, code };
  }

  if (accessToken) {
    return { success: true, accessToken, verified: verified === "true" };
  }

  // Error case
  return {
    success: false,
    error: error || "unknown_error",
    errorDescription: errorDescription || undefined,
  };
}

/**
 * Get a user-friendly error message for an SSO error code.
 *
 * @param errorCode - The error code from the callback
 * @param errorDescription - Optional description from the provider
 * @returns User-friendly error message
 */
export function getSSOErrorMessage(
  errorCode: string,
  errorDescription?: string,
): string {
  // If we have a specific error description from the provider, use it
  // but only if it's user-friendly (doesn't contain technical details)
  if (
    errorDescription &&
    !errorDescription.includes("_") &&
    errorDescription.length < 200
  ) {
    return errorDescription;
  }

  // Return mapped message or default
  return SSO_ERROR_MESSAGES[errorCode] || SSO_ERROR_MESSAGES.default;
}

/**
 * Store SSO tokens after successful callback.
 * Stores tokens in both cookies (for API requests) and localStorage (for quick checks).
 *
 * @param accessToken - The access token from SSO callback
 * @param refreshToken - Optional refresh token from SSO callback
 */
export function storeSSOTokens(
  accessToken: string,
  refreshToken?: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  // Build cookie flags with security attributes
  const isSecure = window.location.protocol === "https:";
  const cookieFlags = `path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  const setCookie = (name: string, value: string, days: number) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; ${cookieFlags}`;
  };

  // Store tokens only in cookies (avoid localStorage to reduce XSS exposure)
  setCookie(ACCESS_TOKEN_COOKIE, accessToken, 7);

  // Store refresh token in cookie (90 days) if provided
  if (refreshToken) {
    setCookie(REFRESH_TOKEN_COOKIE, refreshToken, 90);
  }
}

/**
 * Clear SSO/auth tokens from storage.
 * Used for logout or error recovery.
 */
export function clearAuthTokens(): void {
  if (typeof window === "undefined") {
    return;
  }

  // Use same cookie flags as when setting to ensure proper deletion
  const isSecure = window.location.protocol === "https:";
  const cookieFlags = `path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  const deleteCookie = (name: string) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; ${cookieFlags}`;
  };

  deleteCookie(ACCESS_TOKEN_COOKIE);
  deleteCookie(REFRESH_TOKEN_COOKIE);

  // Clear localStorage (legacy cleanup)
  try {
    localStorage.removeItem("accessToken");
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get the redirect destination after successful SSO login.
 * Checks for saved redirect location and clears it.
 *
 * @returns The URL to redirect to (defaults to "/" if no saved redirect)
 */
export function getSSORedirectDestination(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  const redirectTo = localStorage.getItem("redirectTo");
  localStorage.removeItem("redirectTo");

  return redirectTo || "/";
}

/**
 * Handle the post-login redirect behavior based on device type.
 * Sets up localStorage flags for the main app to handle.
 *
 * This matches the behavior in useSignInForm for email/password login.
 */
export function setupPostLoginBehavior(): void {
  if (typeof window === "undefined") {
    return;
  }

  // Check device type for redirection
  const isDesktop = window.innerWidth >= 1024;

  if (isDesktop) {
    // For desktop: redirect to commentary tab and close hamburger menu
    localStorage.setItem("postLoginRedirect", "desktop");
  } else {
    // For mobile/tablet: redirect to Bible page and close hamburger menu
    localStorage.setItem("postLoginRedirect", "mobile");
  }
}

export const SSO_VERIFIER_KEY = "ssoVerifier";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function ssoChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export const SSO_VERIFIER_MAX_AGE_MS = 600_000;

export const SSO_START_FAILED_DESCRIPTION =
  "Sign-in could not start, please try again";

interface PendingVerifier {
  verifier: string;
  startedAt: number;
}

export type SSOProviderName = "google" | "apple";

function callbackPageFor(provider: SSOProviderName): string {
  const query = new URLSearchParams({
    error: "invalid_state",
    error_description: SSO_START_FAILED_DESCRIPTION,
  });
  return `/auth/callback/${provider}?${query}`;
}

export async function startSSOSignIn(
  apiUrl: string,
  provider: SSOProviderName,
): Promise<void> {
  try {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await ssoChallengeFor(verifier);
    const pending: PendingVerifier = { verifier, startedAt: Date.now() };
    sessionStorage.setItem(SSO_VERIFIER_KEY, JSON.stringify(pending));
    const query = new URLSearchParams({
      challenge,
      returnTo: window.location.origin,
    });
    window.location.href = `${apiUrl}/auth/sso/${provider}/redirect?${query}`;
  } catch {
    window.location.href = callbackPageFor(provider);
  }
}

function freshVerifier(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const { verifier, startedAt } = JSON.parse(stored) as PendingVerifier;
    if (typeof verifier !== "string" || typeof startedAt !== "number") {
      return null;
    }
    return Date.now() - startedAt <= SSO_VERIFIER_MAX_AGE_MS ? verifier : null;
  } catch {
    return null;
  }
}

function takePendingVerifier(): string | null {
  try {
    const stored = sessionStorage.getItem(SSO_VERIFIER_KEY);
    sessionStorage.removeItem(SSO_VERIFIER_KEY);
    return freshVerifier(stored);
  } catch {
    return null;
  }
}

export type SSOCodeExchange = (
  code: string,
  verifier: string,
) => Promise<{ accessToken: string; verified: boolean }>;

async function sessionTokenFrom(
  result: SSOCallbackResult,
  verifier: string | null,
  exchangeCode: SSOCodeExchange,
): Promise<string | undefined> {
  if (!verifier) return undefined;
  if (!result.code) return result.accessToken;
  try {
    return (await exchangeCode(result.code, verifier)).accessToken;
  } catch {
    return undefined;
  }
}

export async function handleSSOCallback(
  searchParams: string | URLSearchParams,
  exchangeCode: SSOCodeExchange,
): Promise<{
  success: boolean;
  redirectUrl?: string;
  error?: string;
  errorMessage?: string;
}> {
  const parsed = parseSSOCallbackParams(searchParams);
  const verifier = takePendingVerifier();

  if (parsed.success) {
    const accessToken = await sessionTokenFrom(parsed, verifier, exchangeCode);
    if (accessToken) {
      storeSSOTokens(accessToken);
      setupPostLoginBehavior();
      return { success: true, redirectUrl: getSSORedirectDestination() };
    }
  }

  const error = parsed.success ? "auth_failed" : parsed.error;
  return {
    success: false,
    error,
    errorMessage: getSSOErrorMessage(
      error || "unknown_error",
      parsed.errorDescription,
    ),
  };
}

export function completeSSOCallback(
  search: string,
  exchangeCode: SSOCodeExchange,
): ReturnType<typeof handleSSOCallback> {
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname,
  );
  return handleSSOCallback(search, exchangeCode);
}

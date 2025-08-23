/**
 * Navigation utilities for cross-domain routing
 */

// Get the appropriate app URL based on environment
export function getAppUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_APP_URL_DEV || "http://localhost:3000";
  }
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.versemate.org";
}

// Get the website URL based on environment
export function getWebsiteUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_WEBSITE_URL_DEV || "http://localhost:3002";
  }
  return process.env.NEXT_PUBLIC_WEBSITE_URL || "https://versemate.org";
}

// Navigate to the main app
export function navigateToApp(path = "") {
  if (typeof window === "undefined") return;
  const appUrl = getAppUrl();
  const fullUrl = `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
  window.location.href = fullUrl;
}

// Navigate to login in main app
export function navigateToLogin() {
  navigateToApp("/login");
}

// Navigate to registration in main app
export function navigateToSignUp() {
  navigateToApp("/create-account");
}

// Check if we're currently on the website domain
export function isWebsiteDomain(): boolean {
  if (typeof window === "undefined") return true; // Server-side, assume website
  const hostname = window.location.hostname;
  return (
    hostname === "versemate.org" ||
    hostname === "www.versemate.org" ||
    hostname === "localhost"
  );
}

// Check if we're currently on the app domain
export function isAppDomain(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "app.versemate.org" ||
    (hostname === "localhost" && window.location.port === "3000")
  );
}

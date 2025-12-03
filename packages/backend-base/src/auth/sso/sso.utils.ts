/**
 * SSO Utility Functions
 *
 * Helper functions for SSO OAuth flows including URL building
 * and configuration management.
 */

// OAuth state TTL in seconds (10 minutes)
export const SSO_STATE_TTL = 600;

/**
 * SSO configuration interface
 */
export interface SSOConfig {
  backendUrl: string;
  frontendUrl: string;
  googleClientId: string;
  appleClientId: string;
}

/**
 * Get environment configuration for SSO
 * These are read at runtime to allow tests to set up environment variables
 */
export function getSSOConfig(): SSOConfig {
  return {
    backendUrl: process.env.BACKEND_URL ?? "http://localhost:3001",
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    appleClientId: process.env.APPLE_CLIENT_ID ?? "",
  };
}

/**
 * Generate Google OAuth authorization URL
 *
 * @param state - CSRF protection state parameter
 * @returns Full Google OAuth authorization URL
 */
export function buildGoogleOAuthUrl(state: string): string {
  const config = getSSOConfig();
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${config.backendUrl}/auth/sso/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Generate Apple OAuth authorization URL
 *
 * @param state - CSRF protection state parameter
 * @returns Full Apple OAuth authorization URL
 */
export function buildAppleOAuthUrl(state: string): string {
  const config = getSSOConfig();
  const params = new URLSearchParams({
    client_id: config.appleClientId,
    redirect_uri: `${config.backendUrl}/auth/sso/apple/callback`,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post", // Apple uses form_post by default
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

/**
 * Parameters for building frontend callback URL
 */
export interface FrontendCallbackParams {
  accessToken?: string;
  refreshToken?: string;
  verified?: boolean;
  error?: string;
  errorDescription?: string;
}

/**
 * Build frontend callback URL with tokens or error
 *
 * @param provider - SSO provider (google or apple)
 * @param params - Callback parameters (tokens or error)
 * @returns Full frontend callback URL
 */
export function buildFrontendCallbackUrl(
  provider: "google" | "apple",
  params: FrontendCallbackParams,
): string {
  const config = getSSOConfig();
  const searchParams = new URLSearchParams();

  if (params.accessToken) {
    searchParams.set("accessToken", params.accessToken);
  }
  if (params.refreshToken) {
    searchParams.set("refreshToken", params.refreshToken);
  }
  if (params.verified !== undefined) {
    searchParams.set("verified", String(params.verified));
  }
  if (params.error) {
    searchParams.set("error", params.error);
  }
  if (params.errorDescription) {
    searchParams.set("error_description", params.errorDescription);
  }

  return `${config.frontendUrl}/auth/callback/${provider}?${searchParams.toString()}`;
}

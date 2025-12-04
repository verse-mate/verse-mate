import { type Static, t } from "elysia";

/**
 * SSO Provider enum - supported Single Sign-On providers
 */
export const SSOProviderInput = t.Union([
  t.Literal("google"),
  t.Literal("apple"),
]);

export type SSOProviderInput = Static<typeof SSOProviderInput>;

/**
 * SSO Platform enum - the platform making the request
 */
export const SSOPlatformInput = t.Union([
  t.Literal("web"),
  t.Literal("mobile"),
]);

export type SSOPlatformInput = Static<typeof SSOPlatformInput>;

/**
 * Unified SSO authentication request input
 *
 * Used for both web and mobile SSO authentication:
 * - Web flow: token is the authorization code from OAuth redirect
 * - Mobile flow: token is the ID token from native SDK
 */
export const AuthSSOInput = t.Object({
  /** The SSO provider to authenticate with */
  provider: SSOProviderInput,
  /** Authorization code (web) or ID token (mobile) */
  token: t.String({
    minLength: 1,
  }),
  /** The platform making the request */
  platform: SSOPlatformInput,
});

export type AuthSSOInput = Static<typeof AuthSSOInput>;

/**
 * SSO OAuth state query parameters
 * Used for OAuth callback endpoints
 */
export const SSOCallbackQuery = t.Object({
  /** OAuth state parameter for CSRF protection */
  state: t.Optional(t.String()),
  /** Authorization code from OAuth provider */
  code: t.Optional(t.String()),
  /** Error code if OAuth failed */
  error: t.Optional(t.String()),
  /** Error description */
  error_description: t.Optional(t.String()),
});

export type SSOCallbackQuery = Static<typeof SSOCallbackQuery>;

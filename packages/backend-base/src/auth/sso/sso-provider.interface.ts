/**
 * SSO Provider Interface
 *
 * Defines the contract for SSO provider implementations (Google, Apple, etc.)
 * Each provider must implement token verification and user info extraction.
 */

/**
 * User information extracted from SSO provider
 */
export interface SSOUserInfo {
  /** Unique identifier from the SSO provider (e.g., Google's sub claim) */
  providerUserId: string;
  /** User's email address from the SSO provider */
  email: string;
  /** Whether the email has been verified by the SSO provider */
  emailVerified: boolean;
  /** User's name (optional, may not be provided by all providers) */
  name?: string;
  /** User's first name (optional) */
  firstName?: string;
  /** User's last name (optional) */
  lastName?: string;
  /** User's profile picture URL (optional) */
  picture?: string;
}

/**
 * Token payload returned after successful token verification
 * Contains provider-specific data that can be used to extract user info
 */
export interface SSOTokenPayload {
  /** Provider-specific access token (for web flow) */
  accessToken?: string;
  /** Provider-specific ID token (contains user claims) */
  idToken: string;
  /** Token expiration time in seconds */
  expiresIn?: number;
  /** Raw decoded token claims */
  claims: Record<string, unknown>;
}

/**
 * Platform type for SSO authentication
 * - web: OAuth authorization code flow
 * - mobile: Native SDK ID token verification
 */
export type SSOPlatform = "web" | "mobile";

/**
 * SSO Provider interface
 *
 * Implementations must handle both web and mobile authentication flows:
 * - Web flow: Exchange authorization code for tokens
 * - Mobile flow: Verify ID token directly from native SDK
 */
export interface SSOProvider {
  /** Provider name identifier */
  readonly name: "google" | "apple";

  /**
   * Verify and exchange the provided token/code
   *
   * @param token - Authorization code (web) or ID token (mobile)
   * @param platform - The platform making the request
   * @returns Token payload with claims for user info extraction
   * @throws UnauthorizedError if token verification fails
   */
  verifyToken(token: string, platform: SSOPlatform): Promise<SSOTokenPayload>;

  /**
   * Extract user information from the verified token payload
   *
   * @param tokenPayload - The verified token payload from verifyToken()
   * @returns User information for account creation/linking
   */
  getUserInfo(tokenPayload: SSOTokenPayload): Promise<SSOUserInfo>;
}

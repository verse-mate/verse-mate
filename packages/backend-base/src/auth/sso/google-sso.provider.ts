import { UnauthorizedError, ValidationError } from "../../common/errors";
import type {
  SSOPlatform,
  SSOProvider,
  SSOTokenPayload,
  SSOUserInfo,
} from "./sso-provider.interface";

/**
 * Google OAuth token response
 */
interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

/**
 * Google ID token claims
 */
interface GoogleIdTokenClaims {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean | string;
  at_hash?: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  iat: number;
  exp: number;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

/**
 * Google tokeninfo response for mobile ID token verification
 */
interface GoogleTokenInfoResponse {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  iat: string;
  exp: string;
  alg: string;
  kid: string;
  typ: string;
}

/**
 * Google SSO Provider Implementation
 *
 * Handles Google OAuth 2.0 authentication for both web and mobile platforms:
 * - Web flow: Exchanges authorization code for tokens using Google's token endpoint
 * - Mobile flow: Verifies ID token using Google's tokeninfo endpoint
 *
 * Required environment variables:
 * - GOOGLE_CLIENT_ID: OAuth 2.0 client ID
 * - GOOGLE_CLIENT_SECRET: OAuth 2.0 client secret
 * - GOOGLE_REDIRECT_URI: OAuth callback URL (for web flow)
 */
export class GoogleSSOProvider implements SSOProvider {
  readonly name = "google" as const;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  private readonly tokenEndpoint = "https://oauth2.googleapis.com/token";
  private readonly tokenInfoEndpoint =
    "https://oauth2.googleapis.com/tokeninfo";

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    this.redirectUri =
      process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/sso/google/callback`;

    if (!this.clientId) {
      console.warn(
        "GOOGLE_CLIENT_ID is not set. Google SSO will not work properly.",
      );
    }
  }

  /**
   * Verify and exchange the provided token/code
   *
   * @param token - Authorization code (web) or ID token (mobile)
   * @param platform - The platform making the request
   * @returns Token payload with claims for user info extraction
   */
  async verifyToken(
    token: string,
    platform: SSOPlatform,
  ): Promise<SSOTokenPayload> {
    if (platform === "web") {
      return this.exchangeAuthorizationCode(token);
    }
    return this.verifyIdToken(token);
  }

  /**
   * Exchange authorization code for tokens (web flow)
   */
  private async exchangeAuthorizationCode(
    code: string,
  ): Promise<SSOTokenPayload> {
    if (!this.clientId || !this.clientSecret) {
      throw new ValidationError(
        "Google OAuth is not configured. Missing client credentials.",
      );
    }

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Google token exchange failed:", errorData);
        throw new UnauthorizedError(
          "Failed to exchange authorization code with Google",
        );
      }

      const tokenResponse: GoogleTokenResponse = await response.json();

      // Decode the ID token to extract claims
      const claims = this.decodeIdToken(tokenResponse.id_token);

      return {
        accessToken: tokenResponse.access_token,
        idToken: tokenResponse.id_token,
        expiresIn: tokenResponse.expires_in,
        claims: claims as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      console.error("Google authorization code exchange error:", error);
      throw new UnauthorizedError("Failed to authenticate with Google");
    }
  }

  /**
   * Verify ID token using Google's tokeninfo endpoint (mobile flow)
   */
  private async verifyIdToken(idToken: string): Promise<SSOTokenPayload> {
    try {
      const response = await fetch(
        `${this.tokenInfoEndpoint}?id_token=${encodeURIComponent(idToken)}`,
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Google ID token verification failed:", errorData);
        throw new UnauthorizedError("Invalid or expired Google ID token");
      }

      const tokenInfo: GoogleTokenInfoResponse = await response.json();

      // Validate the audience (should match our client ID)
      if (tokenInfo.aud !== this.clientId) {
        console.error(
          `Google token audience mismatch. Expected: ${this.clientId}, Got: ${tokenInfo.aud}`,
        );
        throw new UnauthorizedError("Invalid Google token audience");
      }

      // Validate issuer
      if (
        tokenInfo.iss !== "accounts.google.com" &&
        tokenInfo.iss !== "https://accounts.google.com"
      ) {
        throw new UnauthorizedError("Invalid Google token issuer");
      }

      // Check expiration
      const exp = Number.parseInt(tokenInfo.exp, 10);
      if (exp * 1000 < Date.now()) {
        throw new UnauthorizedError("Google ID token has expired");
      }

      const claims: GoogleIdTokenClaims = {
        iss: tokenInfo.iss,
        azp: tokenInfo.azp,
        aud: tokenInfo.aud,
        sub: tokenInfo.sub,
        email: tokenInfo.email,
        email_verified: tokenInfo.email_verified === "true",
        name: tokenInfo.name,
        given_name: tokenInfo.given_name,
        family_name: tokenInfo.family_name,
        locale: tokenInfo.locale,
        iat: Number.parseInt(tokenInfo.iat, 10),
        exp,
      };

      return {
        idToken,
        claims: claims as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      console.error("Google ID token verification error:", error);
      throw new UnauthorizedError("Failed to verify Google ID token");
    }
  }

  /**
   * Decode a JWT ID token without verification (used after code exchange)
   * The token has already been verified by Google during the exchange
   */
  private decodeIdToken(idToken: string): GoogleIdTokenClaims {
    try {
      const parts = idToken.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }

      const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
      return JSON.parse(payload) as GoogleIdTokenClaims;
    } catch (error) {
      console.error("Failed to decode Google ID token:", error);
      throw new UnauthorizedError("Invalid Google ID token format");
    }
  }

  /**
   * Extract user information from the verified token payload
   */
  async getUserInfo(tokenPayload: SSOTokenPayload): Promise<SSOUserInfo> {
    const claims = tokenPayload.claims as unknown as GoogleIdTokenClaims;

    if (!claims.sub || !claims.email) {
      throw new ValidationError(
        "Google token missing required claims (sub, email)",
      );
    }

    return {
      providerUserId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified:
        typeof claims.email_verified === "boolean"
          ? claims.email_verified
          : claims.email_verified === "true",
      name: claims.name,
      firstName: claims.given_name,
      lastName: claims.family_name,
    };
  }
}

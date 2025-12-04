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
 * Google JWKS response for public key verification
 */
interface GoogleJWKS {
  keys: GoogleJWK[];
}

/**
 * Google JSON Web Key
 */
interface GoogleJWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
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

  private readonly tokenEndpoint = "https://oauth2.googleapis.com/token";
  private readonly tokenInfoEndpoint =
    "https://oauth2.googleapis.com/tokeninfo";
  private readonly jwksEndpoint = "https://www.googleapis.com/oauth2/v3/certs";

  // Cache for Google's public keys
  private cachedJWKS: GoogleJWKS | null = null;
  private jwksCacheTime = 0;
  private readonly jwksCacheDuration = 3600000; // 1 hour in milliseconds

  /**
   * Get client ID at runtime to support test environment variable changes
   */
  private get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  }

  /**
   * Get client secret at runtime to support test environment variable changes
   */
  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  }

  /**
   * Get redirect URI at runtime to support test environment variable changes
   */
  private get redirectUri(): string {
    return (
      process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/sso/google/callback`
    );
  }

  constructor() {
    if (!process.env.GOOGLE_CLIENT_ID) {
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
        // Log minimal info to avoid exposing sensitive data in logs
        console.warn("Google token exchange failed", {
          status: response.status,
        });
        throw new UnauthorizedError(
          "Failed to exchange authorization code with Google",
        );
      }

      const tokenResponse: GoogleTokenResponse = await response.json();

      // Decode and verify the ID token to extract claims
      const claims = await this.decodeAndVerifyIdToken(tokenResponse.id_token);

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

      // Parse JSON once to avoid double-reading the response stream
      const body = (await response.json().catch(() => ({}))) as
        | GoogleTokenInfoResponse
        | Record<string, unknown>;

      if (!response.ok) {
        // Log minimal info to avoid exposing sensitive data in logs
        console.warn("Google ID token verification failed", {
          status: response.status,
        });
        throw new UnauthorizedError("Invalid or expired Google ID token");
      }

      const tokenInfo = body as GoogleTokenInfoResponse;

      // Validate required fields are present
      if (
        !tokenInfo.sub ||
        !tokenInfo.exp ||
        !tokenInfo.iat ||
        !tokenInfo.iss ||
        !tokenInfo.aud
      ) {
        throw new UnauthorizedError("Google token missing required fields");
      }

      // Validate the audience (should match our client ID)
      if (tokenInfo.aud !== this.clientId) {
        console.warn("Google token audience mismatch");
        throw new UnauthorizedError("Invalid Google token audience");
      }

      // Validate issuer
      if (
        tokenInfo.iss !== "accounts.google.com" &&
        tokenInfo.iss !== "https://accounts.google.com"
      ) {
        throw new UnauthorizedError("Invalid Google token issuer");
      }

      // Check temporal claims
      const exp = Number.parseInt(tokenInfo.exp, 10);
      const iat = Number.parseInt(tokenInfo.iat, 10);
      if (!Number.isFinite(exp) || !Number.isFinite(iat)) {
        throw new UnauthorizedError("Invalid Google token timestamps");
      }
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
   * Decode and verify a JWT ID token with cryptographic signature verification
   */
  private async decodeAndVerifyIdToken(
    idToken: string,
  ): Promise<GoogleIdTokenClaims> {
    try {
      const parts = idToken.split(".");
      if (parts.length !== 3) {
        throw new UnauthorizedError("Invalid JWT format");
      }

      // Decode header to find matching key
      const header = JSON.parse(
        Buffer.from(parts[0], "base64url").toString("utf-8"),
      ) as { kid?: string; alg?: string };

      // Fetch Google's JWKS and find matching key
      const jwks = await this.getGooglePublicKeys();
      let jwk = jwks.keys.find((k) => k.kid === header.kid);
      if (!jwk) {
        // Clear cache and try again in case keys were rotated
        this.cachedJWKS = null;
        const refreshed = await this.getGooglePublicKeys();
        jwk = refreshed.keys.find((k) => k.kid === header.kid);
        if (!jwk) {
          throw new UnauthorizedError("Google public key not found for token");
        }
      }

      // Enforce RS256 algorithm in header
      if (header.alg !== "RS256") {
        throw new UnauthorizedError("Unsupported token algorithm");
      }

      // Verify signature using the JWK
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          alg: "RS256",
          ext: true,
        } as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );

      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const signatureBytes = Buffer.from(parts[2], "base64url");
      // Convert to Uint8Array for WebCrypto compatibility
      const signature = new Uint8Array(
        signatureBytes.buffer,
        signatureBytes.byteOffset,
        signatureBytes.byteLength,
      );

      const valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        signature,
        data,
      );
      if (!valid) {
        throw new UnauthorizedError("Invalid Google ID token signature");
      }

      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8"),
      ) as GoogleIdTokenClaims;

      // Validate issuer and audience
      if (claims.aud !== this.clientId) {
        throw new UnauthorizedError("Invalid Google token audience");
      }
      if (
        claims.iss !== "accounts.google.com" &&
        claims.iss !== "https://accounts.google.com"
      ) {
        throw new UnauthorizedError("Invalid Google token issuer");
      }

      // Validate temporal claims (exp and iat)
      const nowSec = Math.floor(Date.now() / 1000);
      const expNum =
        typeof claims.exp === "string"
          ? Number.parseInt(claims.exp, 10)
          : claims.exp;
      const iatNum =
        typeof claims.iat === "string"
          ? Number.parseInt(claims.iat, 10)
          : claims.iat;

      if (typeof expNum === "number" && expNum < nowSec) {
        throw new UnauthorizedError("Google ID token has expired");
      }
      // Allow 5 minute clock skew for iat
      if (typeof iatNum === "number" && iatNum > nowSec + 300) {
        throw new UnauthorizedError("Invalid Google token issued-at");
      }

      return claims;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError("Invalid Google ID token");
    }
  }

  /**
   * Fetch Google's public keys (JWKS) with caching
   */
  private async getGooglePublicKeys(): Promise<GoogleJWKS> {
    // Return cached keys if still valid
    if (
      this.cachedJWKS &&
      Date.now() - this.jwksCacheTime < this.jwksCacheDuration
    ) {
      return this.cachedJWKS;
    }

    try {
      const response = await fetch(this.jwksEndpoint);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Google public keys: ${response.status}`,
        );
      }

      this.cachedJWKS = (await response.json()) as GoogleJWKS;
      this.jwksCacheTime = Date.now();

      return this.cachedJWKS;
    } catch {
      throw new UnauthorizedError("Unable to verify Google token");
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

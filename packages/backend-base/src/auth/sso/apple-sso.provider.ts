import { createPrivateKey, createSign } from "node:crypto";
import { UnauthorizedError, ValidationError } from "../../common/errors";
import type {
  SSOPlatform,
  SSOProvider,
  SSOTokenPayload,
  SSOUserInfo,
} from "./sso-provider.interface";

/**
 * Apple token response
 */
interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
}

/**
 * Apple ID token claims
 */
interface AppleIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  at_hash?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  auth_time?: number;
  nonce_supported?: boolean;
  real_user_status?: number;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

/**
 * Apple JWKS response
 */
interface AppleJWKS {
  keys: AppleJWK[];
}

/**
 * Apple JSON Web Key
 */
interface AppleJWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

/**
 * Apple SSO Provider Implementation
 *
 * Handles Apple Sign In for both web and mobile platforms:
 * - Web flow: Exchanges authorization code for tokens using Apple's token endpoint
 * - Mobile flow: Verifies ID token using Apple's public keys (JWKS)
 *
 * Required environment variables:
 * - APPLE_CLIENT_ID: Services ID (for web) or Bundle ID (for mobile)
 * - APPLE_TEAM_ID: Apple Developer Team ID
 * - APPLE_KEY_ID: Key ID for the Sign in with Apple key
 * - APPLE_PRIVATE_KEY: Private key in PEM format (ES256)
 */
export class AppleSSOProvider implements SSOProvider {
  readonly name = "apple" as const;

  private readonly clientId: string;
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: string;
  private readonly redirectUri: string;

  private readonly tokenEndpoint = "https://appleid.apple.com/auth/token";
  private readonly jwksEndpoint = "https://appleid.apple.com/auth/keys";

  // Cache for Apple's public keys
  private cachedJWKS: AppleJWKS | null = null;
  private jwksCacheTime = 0;
  private readonly jwksCacheDuration = 3600000; // 1 hour in milliseconds

  constructor() {
    this.clientId = process.env.APPLE_CLIENT_ID ?? "";
    this.teamId = process.env.APPLE_TEAM_ID ?? "";
    this.keyId = process.env.APPLE_KEY_ID ?? "";
    // Handle newlines in the private key (may be escaped in env vars)
    this.privateKey = (process.env.APPLE_PRIVATE_KEY ?? "").replace(
      /\\n/g,
      "\n",
    );
    this.redirectUri =
      process.env.APPLE_REDIRECT_URI ??
      `${process.env.BACKEND_URL ?? "http://localhost:3001"}/auth/sso/apple/callback`;

    if (!this.clientId || !this.teamId || !this.keyId) {
      console.warn(
        "Apple Sign In is not fully configured. Missing required environment variables.",
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
    if (!this.clientId || !this.teamId || !this.keyId || !this.privateKey) {
      throw new ValidationError(
        "Apple Sign In is not configured. Missing required credentials.",
      );
    }

    try {
      const clientSecret = this.generateClientSecret();

      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Apple token exchange failed:", errorData);
        throw new UnauthorizedError(
          "Failed to exchange authorization code with Apple",
        );
      }

      const tokenResponse: AppleTokenResponse = await response.json();

      // Decode and verify the ID token
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
      console.error("Apple authorization code exchange error:", error);
      throw new UnauthorizedError("Failed to authenticate with Apple");
    }
  }

  /**
   * Verify ID token using Apple's public keys (mobile flow)
   */
  private async verifyIdToken(idToken: string): Promise<SSOTokenPayload> {
    try {
      const claims = await this.decodeAndVerifyIdToken(idToken);

      return {
        idToken,
        claims: claims as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      console.error("Apple ID token verification error:", error);
      throw new UnauthorizedError("Failed to verify Apple ID token");
    }
  }

  /**
   * Decode and verify an Apple ID token with cryptographic signature verification
   */
  private async decodeAndVerifyIdToken(
    idToken: string,
  ): Promise<AppleIdTokenClaims> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedError("Invalid Apple ID token format");
    }

    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf-8"),
    ) as { kid: string; alg: string };

    // Resolve Apple's JWK matching the kid
    const jwks = await this.getApplePublicKeys();
    let jwk = jwks.keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      this.cachedJWKS = null;
      const refreshed = await this.getApplePublicKeys();
      jwk = refreshed.keys.find((k) => k.kid === header.kid);
      if (!jwk) {
        throw new UnauthorizedError("Apple public key not found for token");
      }
    }

    // Enforce RS256 algorithm in header
    if (header.alg !== "RS256") {
      throw new UnauthorizedError("Unsupported Apple token algorithm");
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
      throw new UnauthorizedError("Invalid Apple ID token signature");
    }

    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as AppleIdTokenClaims;

    this.verifyClaims(claims);
    return claims;
  }

  /**
   * Verify Apple ID token claims
   */
  private verifyClaims(claims: AppleIdTokenClaims): void {
    // Verify issuer
    if (claims.iss !== "https://appleid.apple.com") {
      throw new UnauthorizedError("Invalid Apple token issuer");
    }

    // Verify audience (should match our client ID)
    if (claims.aud !== this.clientId) {
      console.error(
        `Apple token audience mismatch. Expected: ${this.clientId}, Got: ${claims.aud}`,
      );
      throw new UnauthorizedError("Invalid Apple token audience");
    }

    // Verify expiration
    if (claims.exp * 1000 < Date.now()) {
      throw new UnauthorizedError("Apple ID token has expired");
    }
  }

  /**
   * Fetch Apple's public keys (JWKS) with caching
   */
  private async getApplePublicKeys(): Promise<AppleJWKS> {
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
          `Failed to fetch Apple public keys: ${response.status}`,
        );
      }

      this.cachedJWKS = (await response.json()) as AppleJWKS;
      this.jwksCacheTime = Date.now();

      return this.cachedJWKS;
    } catch (error) {
      console.error("Failed to fetch Apple public keys:", error);
      throw new UnauthorizedError("Unable to verify Apple token");
    }
  }

  /**
   * Generate a client secret for Apple Sign In
   * Apple requires a JWT signed with the private key as the client secret
   */
  private generateClientSecret(): string {
    // Guard against missing private key
    if (!this.privateKey?.trim()) {
      throw new ValidationError(
        "Apple Sign In is not configured. Missing APPLE_PRIVATE_KEY.",
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 15777000; // 6 months in seconds (Apple's max)

    const header = { alg: "ES256", kid: this.keyId };
    const payload = {
      iss: this.teamId,
      iat: now,
      exp: expiry,
      aud: "https://appleid.apple.com",
      sub: this.clientId,
    };

    const headerBase64 = Buffer.from(JSON.stringify(header)).toString(
      "base64url",
    );
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const unsignedToken = `${headerBase64}.${payloadBase64}`;

    const privateKey = createPrivateKey({
      key: this.privateKey,
      format: "pem",
    });
    // Use sha256 for ECDSA and finalize stream before signing
    const sign = createSign("sha256");
    sign.update(unsignedToken);
    sign.end();
    // Use ieee-p1363 encoding to get raw R||S format directly (avoids manual DER conversion)
    const signature = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

    const signatureBase64 = Buffer.from(signature).toString("base64url");
    return `${unsignedToken}.${signatureBase64}`;
  }

  /**
   * Extract user information from the verified token payload
   */
  async getUserInfo(tokenPayload: SSOTokenPayload): Promise<SSOUserInfo> {
    const claims = tokenPayload.claims as unknown as AppleIdTokenClaims;

    if (!claims.sub) {
      throw new ValidationError("Apple token missing required claim (sub)");
    }

    // Apple may not always provide email (e.g., if user hides it)
    // In production, you should handle this case appropriately
    const email = claims.email ?? "";

    if (!email) {
      console.warn(
        "Apple Sign In: No email provided. User may have chosen to hide their email.",
      );
    }

    // Handle email_verified which can be boolean or string
    let emailVerified = false;
    if (typeof claims.email_verified === "boolean") {
      emailVerified = claims.email_verified;
    } else if (typeof claims.email_verified === "string") {
      emailVerified = claims.email_verified === "true";
    }

    // Check if it's a private relay email
    const isPrivateRelay =
      claims.is_private_email === true ||
      claims.is_private_email === "true" ||
      email.includes("privaterelay.appleid.com");

    if (isPrivateRelay) {
      console.info("Apple Sign In: User is using a private relay email.");
    }

    return {
      providerUserId: claims.sub,
      email: email.toLowerCase(),
      emailVerified: emailVerified || email.length > 0, // Apple verifies emails
      // Apple doesn't provide name in ID token (only in first authorization response)
      // Name would need to be captured separately during the OAuth flow
      name: undefined,
      firstName: undefined,
      lastName: undefined,
    };
  }
}

import { randomUUID } from "node:crypto";
import type SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import { Elysia, t } from "elysia";

import { createErrorHandler } from "../common/error-handler";
import { UnauthorizedError, ValidationError } from "../common/errors";
import { authRateLimiters } from "../common/rate-limit.middleware";
import {
  BooleanResponse,
  StandardErrorResponses,
  SuccessResponse,
} from "../common/response-schemas";
import cacheConstants from "../shared/cache.constants";
import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";
import { authDerive, authGuard } from "./auth.utils";
import { AuthChangePasswordInput } from "./dto/auth-change-password.input";
import { AuthForgotPasswordInput } from "./dto/auth-forgot-password.input";
import { AuthLoginInput } from "./dto/auth-login.input";
import { AuthResetPasswordInput } from "./dto/auth-reset-password.input";
import { AuthSignupInput } from "./dto/auth-signup.input";
import { AuthSSOInput, SSOCallbackQuery } from "./dto/auth-sso.input";
import { AuthUpdateProfileInput } from "./dto/auth-update-profile.input";
import type { AuthPayload } from "./entities/auth.entity";
import {
  AuthPayloadSchema,
  UserIdResponseSchema,
  UserSchema,
} from "./schemas/auth-response.schema";
import { ssoProviderFactory } from "./sso/sso-provider.factory";
import {
  SSO_STATE_TTL,
  buildAppleOAuthUrl,
  buildFrontendCallbackUrl,
  buildGoogleOAuthUrl,
  createRedirectResponse,
  extractClientIp,
  getSSOConfig,
} from "./sso/sso.utils";

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("auth plugin"))
  .state((state) => {
    return {
      ...state,
      authService: new AuthService(state.db, state.cache, state.notification),
    };
  })
  .group("/auth", (app) =>
    app
      .guard(authGuard, (app) =>
        app
          .resolve({ as: "scoped" }, authDerive)
          .get(
            "/user",
            async ({ currentUserId }): Promise<{ id: string | null }> => {
              return {
                id: currentUserId,
              };
            },
            {
              response: {
                200: UserIdResponseSchema,
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/change-password",
            async ({
              body,
              currentUserId,
              store: { authService },
            }): Promise<boolean> => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              return authService.changePassword(currentUserId, body);
            },
            {
              body: AuthChangePasswordInput,
              response: {
                200: BooleanResponse,
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/logout",
            async ({
              bearer,
              store: { authService },
              jwt,
            }): Promise<boolean> => {
              if (!bearer) {
                return false;
              }

              return authService.logout(bearer, jwt);
            },
            {
              response: {
                200: BooleanResponse,
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/logout-all",
            async ({
              currentUserId,
              store: { authService },
            }): Promise<boolean> => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              return authService.logoutAll(currentUserId);
            },
            {
              response: {
                200: BooleanResponse,
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/send-email-verification",
            async ({ currentUserId, store: { authService }, set }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              await authService.sendVerifyEmail(currentUserId);
              set.status = 204;
              return undefined;
            },
            {
              response: {
                204: t.Undefined(),
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/verify-email",
            async ({
              currentUserId,
              body,
              store: { authService },
              jwt,
            }): Promise<AuthPayload> => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              return authService.verifyEmail({
                currentUserId,
                token: body.token,
                jwt,
              });
            },
            {
              body: t.Object({
                token: t.String(),
              }),
              response: {
                200: AuthPayloadSchema,
                ...StandardErrorResponses,
              },
            },
          )
          .get(
            "/session",
            async ({ currentUserId, store: { authService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              const user = await authService.getUserById(currentUserId);
              if (!user) {
                throw new UnauthorizedError("User not found");
              }
              return user;
            },
            {
              response: {
                200: UserSchema,
                ...StandardErrorResponses,
              },
            },
          )
          .put(
            "/profile",
            async ({ currentUserId, body, store: { authService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              const user = await authService.updateProfile(currentUserId, body);
              if (!user) {
                throw new UnauthorizedError("User not found");
              }
              return user;
            },
            {
              body: AuthUpdateProfileInput,
              response: {
                200: UserSchema,
                ...StandardErrorResponses,
              },
            },
          )
          .delete(
            "/account",
            async ({ currentUserId, body, store: { authService }, set }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              await authService.deleteAccount(currentUserId, body?.password);
              set.status = 200;
              return { success: true, message: "Account successfully deleted" };
            },
            {
              body: t.Optional(
                t.Object({
                  password: t.Optional(t.String()),
                }),
              ),
              beforeHandle: authRateLimiters.deleteAccount,
              response: {
                200: t.Object({
                  success: t.Boolean(),
                  message: t.String(),
                }),
                ...StandardErrorResponses,
              },
            },
          ),
      )
      .post(
        "/signup",
        async ({ body, store: { authService }, jwt }): Promise<AuthPayload> => {
          return authService.signup(body, jwt);
        },
        {
          body: AuthSignupInput,
          beforeHandle: authRateLimiters.signup,
          response: {
            200: AuthPayloadSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/login",
        async ({
          body,
          store: { authService },
          jwt,
          request,
        }): Promise<AuthPayload> => {
          const userAgent = request.headers.get("user-agent") || undefined;
          const ipAddress = extractClientIp(request);
          return authService.login(body, jwt, userAgent, ipAddress);
        },
        {
          body: AuthLoginInput,
          beforeHandle: authRateLimiters.login,
          response: {
            200: AuthPayloadSchema,
            ...StandardErrorResponses,
          },
        },
      )
      // /refresh endpoint removed per D-005 — access token is the persistent session.
      .post(
        "/forgot-password",
        async ({ body, store: { authService } }) => {
          const success = await authService.forgotPassword(body);
          return { success };
        },
        {
          body: AuthForgotPasswordInput,
          beforeHandle: authRateLimiters.forgotPassword,
          response: {
            200: SuccessResponse,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/reset-password",
        async ({ body, store: { authService } }) => {
          const success = await authService.resetPassword(body);
          return { success };
        },
        {
          body: AuthResetPasswordInput,
          response: {
            200: SuccessResponse,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/reset-password-verify",
        async ({ query, store: { authService } }) => {
          const success = await authService.resetPasswordVerify(query.token);
          return { success };
        },
        {
          query: t.Object({
            token: t.String(),
          }),
          response: {
            200: SuccessResponse,
            ...StandardErrorResponses,
          },
        },
      )
      // ==================== SSO ENDPOINTS ====================
      /**
       * POST /auth/sso - Unified SSO authentication endpoint
       *
       * Handles both web (authorization code) and mobile (ID token) flows
       * for Google and Apple SSO providers.
       */
      .post(
        "/sso",
        async ({
          body,
          store: { authService },
          jwt,
          request,
        }): Promise<AuthPayload> => {
          const { provider, token, platform } = body;

          // Validate provider is supported
          if (!ssoProviderFactory.isSupported(provider)) {
            throw new ValidationError(
              `Unsupported SSO provider: ${provider}. Supported providers are: google, apple`,
            );
          }

          // Get the appropriate SSO provider
          const ssoProvider = ssoProviderFactory.getProvider(provider);

          // Verify the token and get token payload
          const tokenPayload = await ssoProvider.verifyToken(token, platform);

          // Extract user info from the token
          const userInfo = await ssoProvider.getUserInfo(tokenPayload);

          // Get request metadata for session tracking
          const userAgent = request.headers.get("user-agent") || undefined;
          const ipAddress = extractClientIp(request);

          // Login or create user with SSO
          return authService.loginWithSSO(
            provider as SsoProviderEnum,
            userInfo,
            jwt,
            userAgent,
            ipAddress,
          );
        },
        {
          body: AuthSSOInput,
          beforeHandle: authRateLimiters.sso,
          response: {
            200: AuthPayloadSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * GET /auth/sso/google/redirect - Initiate Google OAuth flow
       *
       * Generates a state parameter for CSRF protection and redirects
       * the user to Google's OAuth consent screen.
       */
      .get(
        "/sso/google/redirect",
        async ({ store: { cache } }) => {
          const config = getSSOConfig();
          if (!config.googleClientId) {
            throw new ValidationError(
              "Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.",
            );
          }

          // Generate state parameter for CSRF protection
          const state = randomUUID();

          // Store state in Redis with 10-minute TTL
          await cache.set(
            cacheConstants.ssoState(state),
            { provider: "google", createdAt: Date.now() },
            `${SSO_STATE_TTL}s`,
          );

          // Build OAuth URL and redirect
          const authUrl = buildGoogleOAuthUrl(state);
          return createRedirectResponse(authUrl);
        },
        {
          response: {
            302: t.Any(),
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * GET /auth/sso/google/callback - Handle Google OAuth callback
       *
       * Verifies the state parameter, exchanges the authorization code
       * for tokens, and redirects to the frontend with authentication result.
       */
      .get(
        "/sso/google/callback",
        async ({ query, store: { cache, authService }, jwt, request }) => {
          const { state, code, error } = query;

          // Handle OAuth errors from Google
          if (error) {
            // Log minimal info to avoid sensitive data in logs
            console.warn("Google OAuth callback failed");
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                error: "oauth_error",
                errorDescription: "OAuth authentication failed",
              }),
            );
          }

          // Verify state parameter
          if (!state) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                error: "invalid_state",
                errorDescription: "Missing state parameter",
              }),
            );
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          // Validate state exists, matches provider, and hasn't expired
          const now = Date.now();
          const maxAgeMs = SSO_STATE_TTL * 1000;
          if (
            !storedState ||
            storedState.provider !== "google" ||
            now - storedState.createdAt > maxAgeMs
          ) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                error: "invalid_state",
                errorDescription: "Invalid or expired state parameter",
              }),
            );
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Verify authorization code is present
          if (!code) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                error: "missing_code",
                errorDescription: "Missing authorization code",
              }),
            );
          }

          try {
            // Get the Google SSO provider
            const ssoProvider = ssoProviderFactory.getProvider("google");

            // Exchange authorization code for tokens (web flow)
            const tokenPayload = await ssoProvider.verifyToken(code, "web");
            const userInfo = await ssoProvider.getUserInfo(tokenPayload);

            // Get request metadata
            const userAgent = request.headers.get("user-agent") || undefined;
            const ipAddress = extractClientIp(request);

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "google" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                accessToken: authPayload.accessToken,
                verified: authPayload.verified,
              }),
            );
          } catch (err) {
            // Log error internally but don't expose details to frontend
            console.error("Google SSO callback error:", err);
            return createRedirectResponse(
              buildFrontendCallbackUrl("google", {
                error: "auth_failed",
                errorDescription: "OAuth authentication failed",
              }),
            );
          }
        },
        {
          query: SSOCallbackQuery,
          response: {
            302: t.Any(),
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * GET /auth/sso/apple/redirect - Initiate Apple Sign In flow
       *
       * Generates a state parameter for CSRF protection and redirects
       * the user to Apple's Sign In page.
       */
      .get(
        "/sso/apple/redirect",
        async ({ store: { cache } }) => {
          const config = getSSOConfig();
          if (!config.appleClientId) {
            throw new ValidationError(
              "Apple Sign In is not configured. Missing APPLE_CLIENT_ID.",
            );
          }

          // Generate state parameter for CSRF protection
          const state = randomUUID();

          // Store state in Redis with 10-minute TTL
          await cache.set(
            cacheConstants.ssoState(state),
            { provider: "apple", createdAt: Date.now() },
            `${SSO_STATE_TTL}s`,
          );

          // Build OAuth URL and redirect
          const authUrl = buildAppleOAuthUrl(state);
          return createRedirectResponse(authUrl);
        },
        {
          response: {
            302: t.Any(),
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * GET /auth/sso/apple/callback - Handle Apple Sign In callback (GET)
       *
       * Note: Apple can send callbacks as both GET (with code in query)
       * or POST (with code in form body). This handles the GET case.
       */
      .get(
        "/sso/apple/callback",
        async ({ query, store: { cache, authService }, jwt, request }) => {
          const { state, code, error } = query;

          // Handle OAuth errors from Apple
          if (error) {
            // Log minimal info to avoid sensitive data in logs
            console.warn("Apple OAuth callback failed");
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "oauth_error",
                errorDescription: "OAuth authentication failed",
              }),
            );
          }

          // Verify state parameter
          if (!state) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "invalid_state",
                errorDescription: "Missing state parameter",
              }),
            );
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          // Validate state exists, matches provider, and hasn't expired
          const now = Date.now();
          const maxAgeMs = SSO_STATE_TTL * 1000;
          if (
            !storedState ||
            storedState.provider !== "apple" ||
            now - storedState.createdAt > maxAgeMs
          ) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "invalid_state",
                errorDescription: "Invalid or expired state parameter",
              }),
            );
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Verify authorization code is present
          if (!code) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "missing_code",
                errorDescription: "Missing authorization code",
              }),
            );
          }

          try {
            // Get the Apple SSO provider
            const ssoProvider = ssoProviderFactory.getProvider("apple");

            // Exchange authorization code for tokens (web flow)
            const tokenPayload = await ssoProvider.verifyToken(code, "web");
            const userInfo = await ssoProvider.getUserInfo(tokenPayload);

            // Get request metadata
            const userAgent = request.headers.get("user-agent") || undefined;
            const ipAddress = extractClientIp(request);

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "apple" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                accessToken: authPayload.accessToken,
                verified: authPayload.verified,
              }),
            );
          } catch (err) {
            // Log error internally but don't expose details to frontend
            console.error("Apple SSO callback error:", err);
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "auth_failed",
                errorDescription: "OAuth authentication failed",
              }),
            );
          }
        },
        {
          query: SSOCallbackQuery,
          response: {
            302: t.Any(),
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * POST /auth/sso/apple/callback - Handle Apple Sign In callback (POST)
       *
       * Apple sends callbacks as POST with form data when using
       * response_mode: "form_post". This handles that case.
       */
      .post(
        "/sso/apple/callback",
        async ({ body, store: { cache, authService }, jwt, request }) => {
          const { state, code, error, id_token, user } = body;

          // Handle OAuth errors from Apple
          if (error) {
            console.error("Apple OAuth error (POST):", error);
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: error,
                errorDescription: "OAuth authentication failed",
              }),
            );
          }

          // Verify state parameter
          if (!state) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "invalid_state",
                errorDescription: "Missing state parameter",
              }),
            );
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          if (!storedState || storedState.provider !== "apple") {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "invalid_state",
                errorDescription: "Invalid or expired state parameter",
              }),
            );
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Apple can send either code or id_token
          const tokenToVerify = code || id_token;
          if (!tokenToVerify) {
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "missing_code",
                errorDescription: "Missing authorization code or ID token",
              }),
            );
          }

          try {
            // Get the Apple SSO provider
            const ssoProvider = ssoProviderFactory.getProvider("apple");

            // Determine if we have a code or id_token
            // If id_token is present, use mobile flow (direct token verification)
            // If only code is present, use web flow (exchange code for tokens)
            const platform = id_token && !code ? "mobile" : "web";
            const tokenPayload = await ssoProvider.verifyToken(
              tokenToVerify,
              platform,
            );
            const userInfo = await ssoProvider.getUserInfo(tokenPayload);

            // Apple may include user info in the first authorization only
            // Parse the user JSON if present to get name
            if (user) {
              try {
                const userData =
                  typeof user === "string" ? JSON.parse(user) : user;
                if (userData.name) {
                  if (userData.name.firstName && !userInfo.firstName) {
                    userInfo.firstName = userData.name.firstName;
                  }
                  if (userData.name.lastName && !userInfo.lastName) {
                    userInfo.lastName = userData.name.lastName;
                  }
                  if (
                    !userInfo.name &&
                    (userData.name.firstName || userData.name.lastName)
                  ) {
                    userInfo.name = [
                      userData.name.firstName,
                      userData.name.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ");
                  }
                }
              } catch {
                // Ignore parse errors for user data
                console.warn("Failed to parse Apple user data");
              }
            }

            // Get request metadata
            const userAgent = request.headers.get("user-agent") || undefined;
            const ipAddress = extractClientIp(request);

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "apple" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                accessToken: authPayload.accessToken,
                verified: authPayload.verified,
              }),
            );
          } catch (err) {
            // Log error internally but don't expose details to frontend
            console.error("Apple SSO callback error (POST):", err);
            return createRedirectResponse(
              buildFrontendCallbackUrl("apple", {
                error: "auth_failed",
                errorDescription: "OAuth authentication failed",
              }),
            );
          }
        },
        {
          body: t.Object({
            state: t.Optional(t.String()),
            code: t.Optional(t.String()),
            id_token: t.Optional(t.String()),
            error: t.Optional(t.String()),
            user: t.Optional(t.String()), // Apple sends user info as JSON string
          }),
          response: {
            302: t.Any(),
            ...StandardErrorResponses,
          },
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

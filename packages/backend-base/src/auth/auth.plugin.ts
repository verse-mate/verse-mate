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
              body,
              store: { authService },
              jwt,
            }): Promise<boolean> => {
              if (!bearer) {
                return false;
              }

              return authService.logout(
                bearer,
                body?.refreshToken || null,
                jwt,
              );
            },
            {
              body: t.Optional(
                t.Object({
                  refreshToken: t.Optional(t.String()),
                }),
              ),
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
          const ipAddress =
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            undefined;
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
      .post(
        "/refresh",
        async ({ body, store: { authService }, jwt }): Promise<AuthPayload> => {
          return authService.refresh(body.refreshToken, jwt);
        },
        {
          body: t.Object({
            refreshToken: t.String(),
          }),
          beforeHandle: authRateLimiters.refresh,
          response: {
            200: AuthPayloadSchema,
            ...StandardErrorResponses,
          },
        },
      )
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
          const ipAddress =
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            undefined;

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
        async ({ store: { cache }, set }) => {
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
          set.redirect = authUrl;
          set.status = 302;
          return;
        },
        {
          response: {
            302: t.Undefined(),
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
        async ({ query, store: { cache, authService }, jwt, set, request }) => {
          const { state, code, error, error_description } = query;

          // Handle OAuth errors from Google
          if (error) {
            console.error("Google OAuth error:", error, error_description);
            set.redirect = buildFrontendCallbackUrl("google", {
              error: error,
              errorDescription:
                error_description || "OAuth authentication failed",
            });
            set.status = 302;
            return;
          }

          // Verify state parameter
          if (!state) {
            set.redirect = buildFrontendCallbackUrl("google", {
              error: "invalid_state",
              errorDescription: "Missing state parameter",
            });
            set.status = 302;
            return;
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          if (!storedState || storedState.provider !== "google") {
            set.redirect = buildFrontendCallbackUrl("google", {
              error: "invalid_state",
              errorDescription: "Invalid or expired state parameter",
            });
            set.status = 302;
            return;
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Verify authorization code is present
          if (!code) {
            set.redirect = buildFrontendCallbackUrl("google", {
              error: "missing_code",
              errorDescription: "Missing authorization code",
            });
            set.status = 302;
            return;
          }

          try {
            // Get the Google SSO provider
            const ssoProvider = ssoProviderFactory.getProvider("google");

            // Exchange authorization code for tokens (web flow)
            const tokenPayload = await ssoProvider.verifyToken(code, "web");
            const userInfo = await ssoProvider.getUserInfo(tokenPayload);

            // Get request metadata
            const userAgent = request.headers.get("user-agent") || undefined;
            const ipAddress =
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              undefined;

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "google" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            set.redirect = buildFrontendCallbackUrl("google", {
              accessToken: authPayload.accessToken,
              refreshToken: authPayload.refreshToken,
              verified: authPayload.verified,
            });
            set.status = 302;
            return;
          } catch (err) {
            console.error("Google SSO callback error:", err);
            const errorMessage =
              err instanceof Error ? err.message : "Authentication failed";
            set.redirect = buildFrontendCallbackUrl("google", {
              error: "auth_failed",
              errorDescription: errorMessage,
            });
            set.status = 302;
            return;
          }
        },
        {
          query: SSOCallbackQuery,
          response: {
            302: t.Undefined(),
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
        async ({ store: { cache }, set }) => {
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
          set.redirect = authUrl;
          set.status = 302;
          return;
        },
        {
          response: {
            302: t.Undefined(),
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
        async ({ query, store: { cache, authService }, jwt, set, request }) => {
          const { state, code, error, error_description } = query;

          // Handle OAuth errors from Apple
          if (error) {
            console.error("Apple OAuth error:", error, error_description);
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: error,
              errorDescription:
                error_description || "OAuth authentication failed",
            });
            set.status = 302;
            return;
          }

          // Verify state parameter
          if (!state) {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "invalid_state",
              errorDescription: "Missing state parameter",
            });
            set.status = 302;
            return;
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          if (!storedState || storedState.provider !== "apple") {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "invalid_state",
              errorDescription: "Invalid or expired state parameter",
            });
            set.status = 302;
            return;
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Verify authorization code is present
          if (!code) {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "missing_code",
              errorDescription: "Missing authorization code",
            });
            set.status = 302;
            return;
          }

          try {
            // Get the Apple SSO provider
            const ssoProvider = ssoProviderFactory.getProvider("apple");

            // Exchange authorization code for tokens (web flow)
            const tokenPayload = await ssoProvider.verifyToken(code, "web");
            const userInfo = await ssoProvider.getUserInfo(tokenPayload);

            // Get request metadata
            const userAgent = request.headers.get("user-agent") || undefined;
            const ipAddress =
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              undefined;

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "apple" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            set.redirect = buildFrontendCallbackUrl("apple", {
              accessToken: authPayload.accessToken,
              refreshToken: authPayload.refreshToken,
              verified: authPayload.verified,
            });
            set.status = 302;
            return;
          } catch (err) {
            console.error("Apple SSO callback error:", err);
            const errorMessage =
              err instanceof Error ? err.message : "Authentication failed";
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "auth_failed",
              errorDescription: errorMessage,
            });
            set.status = 302;
            return;
          }
        },
        {
          query: SSOCallbackQuery,
          response: {
            302: t.Undefined(),
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
        async ({ body, store: { cache, authService }, jwt, set, request }) => {
          const { state, code, error, id_token, user } = body;

          // Handle OAuth errors from Apple
          if (error) {
            console.error("Apple OAuth error (POST):", error);
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: error,
              errorDescription: "OAuth authentication failed",
            });
            set.status = 302;
            return;
          }

          // Verify state parameter
          if (!state) {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "invalid_state",
              errorDescription: "Missing state parameter",
            });
            set.status = 302;
            return;
          }

          // Check state in Redis
          const storedState = await cache.get<{
            provider: string;
            createdAt: number;
          }>(cacheConstants.ssoState(state));

          if (!storedState || storedState.provider !== "apple") {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "invalid_state",
              errorDescription: "Invalid or expired state parameter",
            });
            set.status = 302;
            return;
          }

          // Delete used state to prevent replay attacks
          await cache.delete(cacheConstants.ssoState(state));

          // Apple can send either code or id_token
          const tokenToVerify = code || id_token;
          if (!tokenToVerify) {
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "missing_code",
              errorDescription: "Missing authorization code or ID token",
            });
            set.status = 302;
            return;
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
            const ipAddress =
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              undefined;

            // Login or create user with SSO
            const authPayload = await authService.loginWithSSO(
              "apple" as SsoProviderEnum,
              userInfo,
              jwt,
              userAgent,
              ipAddress,
            );

            // Redirect to frontend with tokens
            set.redirect = buildFrontendCallbackUrl("apple", {
              accessToken: authPayload.accessToken,
              refreshToken: authPayload.refreshToken,
              verified: authPayload.verified,
            });
            set.status = 302;
            return;
          } catch (err) {
            console.error("Apple SSO callback error (POST):", err);
            const errorMessage =
              err instanceof Error ? err.message : "Authentication failed";
            set.redirect = buildFrontendCallbackUrl("apple", {
              error: "auth_failed",
              errorDescription: errorMessage,
            });
            set.status = 302;
            return;
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
            302: t.Undefined(),
            ...StandardErrorResponses,
          },
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

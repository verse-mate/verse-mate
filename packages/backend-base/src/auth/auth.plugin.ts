import { Elysia, t } from "elysia";

import bearer from "@elysiajs/bearer";
import { ApiError, UnauthorizedError } from "../common/errors";
import { AuthErrorsRef, StandardErrorsRef } from "../common/response-models";
import shared from "../shared/shared.plugin";
import { AuthService } from "./auth.service";
import { authDerive, authGuard } from "./auth.utils";
import { AuthChangePasswordInput } from "./dto/auth-change-password.input";
import { AuthForgotPasswordInput } from "./dto/auth-forgot-password.input";
import { AuthLoginInput } from "./dto/auth-login.input";
import { AuthResetPasswordInput } from "./dto/auth-reset-password.input";
import { AuthSignupInput } from "./dto/auth-signup.input";
import { AuthUpdateProfileInput } from "./dto/auth-update-profile.input";
import type { AuthPayload } from "./entities/auth.entity";

// Response schemas
const AuthPayloadResponse = t.Object({
  accessToken: t.String({ description: "JWT access token" }),
  verified: t.Boolean({ description: "Email verification status" }),
});

const UserIdResponse = t.Object({
  id: t.Union([t.String(), t.Null()], {
    description: "Current user ID or null if not authenticated",
  }),
});

const BooleanResponse = t.Boolean({ description: "Operation success status" });

const UserSessionResponse = t.Object({
  id: t.String(),
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  is_admin: t.Boolean(),
  preferred_language: t.Union([t.String(), t.Null()]),
});

const SuccessResponse = t.Object({
  success: t.Boolean(),
  message: t.Optional(t.String()),
});

const plugin = new Elysia()
  .use(shared)
  .onError(({ code, error, set }) => {
    // Handle custom API errors
    if (error instanceof ApiError) {
      set.status = error.status;
      return error.toResponse();
    }

    // Handle Elysia built-in errors
    switch (code) {
      case "VALIDATION":
        set.status = 422;
        return {
          error: "VALIDATION_ERROR",
          message: "Invalid request data",
        };
      case "NOT_FOUND":
        set.status = 404;
        return {
          error: "NOT_FOUND",
          message: "Route not found",
        };
      default:
        console.error("Unhandled error in auth plugin:", error);
        set.status = 500;
        return {
          error: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
        };
    }
  })
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
          .use(bearer())
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
                200: UserIdResponse,
                ...AuthErrorsRef,
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
                ...AuthErrorsRef,
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
                ...AuthErrorsRef,
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
                ...AuthErrorsRef,
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
                204: t.Void(),
                ...AuthErrorsRef,
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
                200: AuthPayloadResponse,
                ...AuthErrorsRef,
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
                200: UserSessionResponse,
                ...AuthErrorsRef,
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
                200: UserSessionResponse,
                ...AuthErrorsRef,
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
          response: {
            200: AuthPayloadResponse,
            ...StandardErrorsRef,
            409: t.Ref("ErrorResponse"),
          },
        },
      )
      .post(
        "/login",
        async ({ body, store: { authService }, jwt }): Promise<AuthPayload> => {
          return authService.login(body, jwt);
        },
        {
          body: AuthLoginInput,
          response: {
            200: AuthPayloadResponse,
            ...StandardErrorsRef,
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
          response: {
            200: SuccessResponse,
            ...StandardErrorsRef,
            404: t.Ref("ErrorResponse"),
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
            ...StandardErrorsRef,
            404: t.Ref("ErrorResponse"),
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
            ...StandardErrorsRef,
            404: t.Ref("ErrorResponse"),
          },
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

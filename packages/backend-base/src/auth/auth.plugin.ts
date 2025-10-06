import { Elysia, t } from "elysia";

import bearer from "@elysiajs/bearer";
import { UnauthorizedError } from "../common/errors";
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
  preferred_language: t.String(),
});

const SuccessResponse = t.Object({
  success: t.Boolean(),
  message: t.Optional(t.String()),
});

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      authService: new AuthService(state.db, state.cache, state.notification),
    };
  })
  .group("/auth", (app) =>
    app
      .guard((app) =>
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
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
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
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
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
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
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
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
              },
            },
          )
          .post(
            "/send-email-verification",
            async ({ currentUserId, store: { authService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              await authService.sendVerifyEmail(currentUserId);
            },
            {
              response: {
                204: t.Void(),
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
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
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
              },
            },
          )
          .get(
            "/session",
            async ({ currentUserId, store: { authService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              return await authService.getUserById(currentUserId);
            },
            {
              response: {
                200: UserSessionResponse,
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
              },
            },
          )
          .put(
            "/profile",
            async ({ currentUserId, body, store: { authService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Unauthorized");
              }
              return await authService.updateProfile(currentUserId, body);
            },
            {
              body: AuthUpdateProfileInput,
              response: {
                200: UserSessionResponse,
                401: t.Ref("ErrorResponse"),
                500: t.Ref("ErrorResponse"),
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
            400: t.Ref("ErrorResponse"),
            409: t.Ref("ErrorResponse"),
            500: t.Ref("ErrorResponse"),
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
            400: t.Ref("ErrorResponse"),
            401: t.Ref("ErrorResponse"),
            500: t.Ref("ErrorResponse"),
          },
        },
      )
      .post(
        "/forgot-password",
        async ({ body, store: { authService } }) => {
          return authService.forgotPassword(body);
        },
        {
          body: AuthForgotPasswordInput,
          response: {
            200: SuccessResponse,
            400: t.Ref("ErrorResponse"),
            404: t.Ref("ErrorResponse"),
            500: t.Ref("ErrorResponse"),
          },
        },
      )
      .post(
        "/reset-password",
        async ({ body, store: { authService } }) => {
          return authService.resetPassword(body);
        },
        {
          body: AuthResetPasswordInput,
          response: {
            200: SuccessResponse,
            400: t.Ref("ErrorResponse"),
            404: t.Ref("ErrorResponse"),
            500: t.Ref("ErrorResponse"),
          },
        },
      )
      .get(
        "/reset-password-verify",
        async ({ query, store: { authService } }) => {
          return authService.resetPasswordVerify(query.token);
        },
        {
          query: t.Object({
            token: t.String(),
          }),
          response: {
            200: SuccessResponse,
            400: t.Ref("ErrorResponse"),
            404: t.Ref("ErrorResponse"),
            500: t.Ref("ErrorResponse"),
          },
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

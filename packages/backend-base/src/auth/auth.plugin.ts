import { Elysia, t } from "elysia";

import { createErrorHandler } from "../common/error-handler";
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
        },
      )
      .post(
        "/login",
        async ({ body, store: { authService }, jwt }): Promise<AuthPayload> => {
          return authService.login(body, jwt);
        },
        {
          body: AuthLoginInput,
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
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

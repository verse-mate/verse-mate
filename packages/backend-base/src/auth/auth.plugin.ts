import { Elysia, t } from "elysia";

import bearer from "@elysiajs/bearer";
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
          )
          .post(
            "/change-password",
            async ({
              body,
              currentUserId,
              store: { authService },
            }): Promise<boolean> => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
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
                throw new Error("Unauthorized");
              }
              return authService.logoutAll(currentUserId);
            },
          )
          .post(
            "/send-email-verification",
            async ({ currentUserId, store: { authService } }) => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
              await authService.sendVerifyEmail(currentUserId);
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
                throw new Error("Unauthorized");
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
                throw new Error("Unauthorized");
              }
              return await authService.getUserById(currentUserId);
            },
          )
          .put(
            "/profile",
            async ({ currentUserId, body, store: { authService } }) => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
              return await authService.updateProfile(currentUserId, body);
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
          return authService.forgotPassword(body);
        },
        {
          body: AuthForgotPasswordInput,
        },
      )
      .post(
        "/reset-password",
        async ({ body, store: { authService } }) => {
          return authService.resetPassword(body);
        },
        {
          body: AuthResetPasswordInput,
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
        },
      ),
  );

export type AuthPlugin = typeof plugin;

export default plugin;

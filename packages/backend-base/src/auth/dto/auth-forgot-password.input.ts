import { type Static, t } from "elysia";

export const AuthForgotPasswordInput = t.Object({
  email: t.String({
    format: "email",
    default: "",
  }),
});

export type AuthForgotPasswordInput = Static<typeof AuthForgotPasswordInput>;

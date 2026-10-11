import { type Static, t } from "elysia";

export const AuthForgotPasswordInput = t.Object({
  email: t.String({
    format: "email",
    maxLength: 250,
    default: "",
  }),
});

export type AuthForgotPasswordInput = Static<typeof AuthForgotPasswordInput>;

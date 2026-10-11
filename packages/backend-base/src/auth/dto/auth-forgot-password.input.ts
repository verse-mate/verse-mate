import { type Static, t } from "elysia";

export const AuthForgotPasswordInput = t.Object({
  email: t.String({
    format: "email",
    maxLength: 254,
    default: "",
  }),
});

export type AuthForgotPasswordInput = Static<typeof AuthForgotPasswordInput>;

import { type Static, t } from "elysia";

export const AuthResetPasswordInput = t.Object({
  key: t.String({
    format: "uuid",
    default: "",
  }),
  password: t.String({
    minLength: 1,
    maxLength: 20,
  }),
});

export type AuthResetPasswordInput = Static<typeof AuthResetPasswordInput>;

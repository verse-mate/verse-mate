import { type Static, t } from "elysia";

export const AuthChangePasswordInput = t.Object({
  currentPassword: t.String({
    minLength: 1,
    maxLength: 20,
  }),
  password: t.String({
    minLength: 1,
    maxLength: 20,
  }),
});

export type AuthChangePasswordInput = Static<typeof AuthChangePasswordInput>;

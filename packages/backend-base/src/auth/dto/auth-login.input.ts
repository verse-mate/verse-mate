import { type Static, t } from "elysia";

export const AuthLoginInput = t.Object({
  email: t.String({
    format: "email",
    maxLength: 254,
    default: "",
  }),
  password: t.String({
    minLength: 1,
    maxLength: 20,
  }),
});

export type AuthLoginInput = Static<typeof AuthLoginInput>;

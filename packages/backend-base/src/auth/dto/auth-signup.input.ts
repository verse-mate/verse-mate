import { type Static, t } from "elysia";

export const AuthSignupInput = t.Object({
  firstName: t.String({
    minLength: 1,
    maxLength: 100,
  }),
  lastName: t.String({
    minLength: 1,
    maxLength: 100,
  }),
  email: t.String({
    format: "email",
    default: "",
  }),
  password: t.String({
    minLength: 8,
    maxLength: 20,
    pattern: "^(?=.*\\d)(?=.*[a-zA-Z]).{8,}$",
  }),
});

export type AuthSignupInput = Static<typeof AuthSignupInput>;

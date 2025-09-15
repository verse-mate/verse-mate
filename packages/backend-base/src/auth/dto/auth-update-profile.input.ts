import { t } from "elysia";

export const AuthUpdateProfileInput = t.Object({
  firstName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  lastName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  email: t.Optional(t.String({ format: "email" })),
});

export type AuthUpdateProfileInput = typeof AuthUpdateProfileInput.static;

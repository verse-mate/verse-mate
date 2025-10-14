import { t } from "elysia";

/**
 * User entity schema for OpenAPI responses
 */
export const UserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.String({ format: "email" }),
  firstName: t.String(),
  lastName: t.String(),
  fullName: t.String(),
  emailVerified: t.Optional(t.Boolean()),
  is_admin: t.Optional(t.Boolean()),
  preferred_language: t.Optional(t.Union([t.String(), t.Null()])),
});

/**
 * Array of users response schema
 */
export const UsersArraySchema = t.Array(UserSchema);

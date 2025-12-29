import { t } from "elysia";

/**
 * User entity schema for OpenAPI responses
 * Matches the return type of AuthService.getUserById() and AuthService.updateProfile()
 */
export const UserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.String({ format: "email" }),
  firstName: t.String(),
  lastName: t.String(),
  is_admin: t.Boolean(),
  preferred_language: t.Union([t.String(), t.Null()]),
  imageSrc: t.Union([t.String(), t.Null()]),
  hasPassword: t.Boolean(),
});

/**
 * Auth payload schema for login/signup/refresh responses
 */
export const AuthPayloadSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.Optional(t.String()),
  verified: t.Boolean(),
});

/**
 * User ID response schema for /auth/user endpoint
 */
export const UserIdResponseSchema = t.Object({
  id: t.Union([t.String({ format: "uuid" }), t.Null()]),
});

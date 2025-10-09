import { t } from "elysia";

/**
 * Auth Plugin Response Entities
 *
 * These TypeBox schemas define output entities for auth.plugin.ts endpoints.
 * DTOs are for input, entities are for output (response types).
 */

export const AuthPayloadSchema = t.Object({
  accessToken: t.String({ description: "JWT access token" }),
  verified: t.Boolean({ description: "Email verification status" }),
});

export const UserIdSchema = t.Object({
  id: t.Union([t.String(), t.Null()], {
    description: "Current user ID or null if not authenticated",
  }),
});

export const BooleanSchema = t.Boolean({
  description: "Operation success status",
});

export const UserSessionSchema = t.Object({
  id: t.String(),
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  is_admin: t.Boolean(),
  preferred_language: t.Union([t.String(), t.Null()]),
});

export const SuccessSchema = t.Object({
  success: t.Boolean(),
  message: t.Optional(t.String()),
});

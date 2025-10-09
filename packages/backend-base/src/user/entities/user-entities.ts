import { t } from "elysia";

/**
 * User Plugin Response Entities
 *
 * These TypeBox schemas define output entities for user.plugin.ts endpoints.
 * DTOs are for input, entities are for output (response types).
 */

export const UserSchema = t.Object({
  id: t.String({
    description: "User unique identifier",
  }),
  email: t.String({
    description: "User email address",
  }),
  firstName: t.String({
    description: "User first name",
  }),
  lastName: t.String({
    description: "User last name",
  }),
  fullName: t.String({
    description: "User full name (firstName + lastName)",
  }),
  emailVerified: t.Optional(
    t.Boolean({
      description: "Whether the user's email is verified",
    }),
  ),
});

export const UsersListSchema = t.Array(UserSchema, {
  description: "List of all users",
});

export const UpdateUserSchema = t.Boolean({
  description: "Whether the update was successful",
});

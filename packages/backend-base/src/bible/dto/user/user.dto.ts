import { type Static, t } from "elysia";

export const UUIDField = t.String({
  format: "uuid",
  error: { message: "Invalid user id" },
});

export const UserDto = t.Object({
  id: UUIDField,
  email: t.String({ format: "email", error: { message: "Invalid email" } }),
  firstName: t.String({ minLength: 1 }),
  lastName: t.String({ minLength: 1 }),
});

export type UserDto = Static<typeof UserDto>;

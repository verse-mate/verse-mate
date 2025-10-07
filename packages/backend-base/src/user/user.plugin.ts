import { Elysia, t } from "elysia";

import bearer from "@elysiajs/bearer";
import { authDerive, authGuard } from "../auth/auth.utils";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import {
  AuthErrors,
  ErrorResponse,
  StandardErrors,
} from "../common/response-models";
import shared from "../shared/shared.plugin";
import { UserService } from "./user.service";

// Response schemas
const UserResponse = t.Object({
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

const UsersListResponse = t.Array(UserResponse, {
  description: "List of all users",
});

const UpdateUserResponse = t.Boolean({
  description: "Whether the update was successful",
});

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    userService: new UserService(state.db),
  }))
  .guard(authGuard, (app) => {
    return app
      .use(bearer())
      .resolve({ as: "scoped" }, authDerive)
      .group("/user", (app) => {
        return app
          .get(
            "",
            async ({ store: { userService } }) => {
              return await userService.findAll();
            },
            {
              detail: {
                summary: "Get all users",
                description: "Retrieve a list of all registered users",
                tags: ["User"],
              },
              response: {
                200: UsersListResponse,
                ...AuthErrors,
              },
            },
          )
          .get(
            "/me",
            async ({ currentUserId, store: { userService } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Authentication required");
              }

              try {
                return await userService.findOne(currentUserId);
              } catch (error) {
                throw new NotFoundError("User not found");
              }
            },
            {
              detail: {
                summary: "Get current user",
                description:
                  "Retrieve the authenticated user's profile information",
                tags: ["User"],
              },
              response: {
                200: UserResponse,
                ...AuthErrors,
                404: ErrorResponse,
              },
            },
          )
          .post(
            "/update",
            async ({ currentUserId, body, store: { db } }) => {
              if (!currentUserId) {
                throw new UnauthorizedError("Authentication required");
              }

              if (!body.firstName?.trim() || !body.lastName?.trim()) {
                throw new ValidationError(
                  "First name and last name are required",
                  {
                    fields: {
                      firstName: !body.firstName?.trim()
                        ? "First name cannot be empty"
                        : undefined,
                      lastName: !body.lastName?.trim()
                        ? "Last name cannot be empty"
                        : undefined,
                    },
                  },
                );
              }

              const result = await db
                .getOrCreateConnection()
                .updateTable("user")
                .set({
                  firstName: body.firstName,
                  lastName: body.lastName,
                })
                .where("id", "=", currentUserId)
                .executeTakeFirst();

              if (!result || result.numUpdatedRows === BigInt(0)) {
                throw new NotFoundError("User not found or update failed");
              }

              return true;
            },
            {
              detail: {
                summary: "Update current user",
                description:
                  "Update the authenticated user's profile information",
                tags: ["User"],
              },
              body: t.Object({
                firstName: t.String({
                  minLength: 1,
                  maxLength: 100,
                  description: "User's first name",
                }),
                lastName: t.String({
                  minLength: 1,
                  maxLength: 100,
                  description: "User's last name",
                }),
              }),
              response: {
                200: UpdateUserResponse,
                ...StandardErrors,
                404: ErrorResponse,
              },
            },
          );
      });
  });

export type UserPlugin = typeof plugin;

export default plugin;

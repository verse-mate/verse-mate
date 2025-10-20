import { Elysia, t } from "elysia";

import { authDerive, authGuard } from "../auth/auth.utils";
import { createErrorHandler } from "../common/error-handler";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import {
  BooleanResponse,
  StandardErrorResponses,
} from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import type { User } from "./entities/user.entity";
import {
  RecentlyViewedBooksSchema,
  SyncRecentlyViewedBooksRequestSchema,
} from "./schemas/recently-viewed-books.schema";
import { UserSchema, UsersArraySchema } from "./schemas/user-response.schema";
import { UserService } from "./user.service";

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("user plugin"))
  .state((state) => ({
    ...state,
    userService: new UserService(state.db),
  }))
  .guard(authGuard, (app) => {
    return app.resolve({ as: "scoped" }, authDerive).group("/user", (app) => {
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
              200: UsersArraySchema,
              ...StandardErrorResponses,
            },
          },
        )
        .get(
          "/me",
          async ({ currentUserId, store: { userService } }): Promise<User> => {
            if (!currentUserId) {
              throw new UnauthorizedError("Authentication required");
            }

            try {
              return await userService.findOne(currentUserId);
            } catch {
              throw new NotFoundError("User not found");
            }
          },
          {
            response: {
              200: UserSchema,
              ...StandardErrorResponses,
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
              200: BooleanResponse,
              ...StandardErrorResponses,
            },
          },
        )
        .get(
          "/recently-viewed-books",
          async ({ currentUserId, store: { userService } }) => {
            if (!currentUserId) {
              throw new UnauthorizedError("Authentication required");
            }

            const bookIds =
              await userService.getRecentlyViewedBooks(currentUserId);
            return { bookIds };
          },
          {
            detail: {
              summary: "Get recently viewed books",
              description:
                "Retrieve the list of recently viewed books for the authenticated user",
              tags: ["User"],
            },
            response: {
              200: RecentlyViewedBooksSchema,
              ...StandardErrorResponses,
            },
          },
        )
        .post(
          "/recently-viewed-books/sync",
          async ({ currentUserId, body, store: { userService } }) => {
            if (!currentUserId) {
              throw new UnauthorizedError("Authentication required");
            }

            const bookIds = await userService.syncRecentlyViewedBooks(
              currentUserId,
              body.books,
            );
            return { bookIds };
          },
          {
            detail: {
              summary: "Sync recently viewed books",
              description:
                "Sync recently viewed books from localStorage with the database",
              tags: ["User"],
            },
            body: SyncRecentlyViewedBooksRequestSchema,
            response: {
              200: RecentlyViewedBooksSchema,
              ...StandardErrorResponses,
            },
          },
        );
    });
  });

export type UserPlugin = typeof plugin;

export default plugin;

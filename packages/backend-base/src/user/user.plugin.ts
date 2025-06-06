import { Elysia, t } from "elysia";

import bearer from "@elysiajs/bearer";
import { authDerive, authGuard } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";
import { UserService } from "./user.service";

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    userService: new UserService(state.db),
  }))
  .guard((app) => {
    return app
      .use(bearer())
      .resolve({ as: "scoped" }, authDerive)
      .group("/user", (app) => {
        return app
          .get("", async ({ store: { userService } }) => {
            return await userService.findAll();
          })
          .get("/me", async ({ currentUserId, store: { userService } }) => {
            return await userService.findOne(currentUserId);
          })
          .post(
            "/update",
            async ({ currentUserId, body, store: { db } }) => {
              const updatedUser = await db
                .getOrCreateConnection()
                .updateTable("user")
                .set({
                  firstName: body.firstName,
                  lastName: body.lastName,
                })
                .where("id", "=", currentUserId)
                .executeTakeFirstOrThrow();

              return Boolean(updatedUser.numUpdatedRows);
            },
            {
              body: t.Object({
                firstName: t.String({
                  minLength: 1,
                  maxLength: 100,
                }),
                lastName: t.String({
                  minLength: 1,
                  maxLength: 100,
                }),
              }),
            },
          );
      });
  });

export type UserPlugin = typeof plugin;

export default plugin;

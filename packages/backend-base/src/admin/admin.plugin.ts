import bearer from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import { adminGuard } from "../auth/admin.utils";
import { authDerive } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";

// Define the plugin type explicitly
const plugin = new Elysia().use(shared).guard((app) => {
  return app
    .use(bearer())
    .resolve({ as: "scoped" }, authDerive)
    .guard(adminGuard)
    .group("/admin", (app) => {
      return app
        .get("/users", async ({ store: { db } }) => {
          return await db
            .getOrCreateConnection()
            .selectFrom("user")
            .select(["id", "email", "firstName", "lastName", "is_admin"])
            .execute();
        })
        .post("/batch-explanations", async ({ body, store: { db } }) => {
          return { success: true, message: "Batch processing started" };
        })
        .delete("/explanation/:id", async ({ params, store: { db } }) => {
          return { success: true, message: `Explanation ${params.id} deleted` };
        });
    });
});

// Export the plugin
export default plugin;
export type AdminPlugin = typeof plugin;

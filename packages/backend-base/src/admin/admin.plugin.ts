import bearer from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import { adminGuard } from "../auth/admin.utils";
import { authDerive } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";
import { AdminDatabaseService } from "./services/admin-database.service";
import { BatchOperationService } from "./services/batch-operations.service";
import { ExplanationRegenerationService } from "./services/explanation-regeneration.service";

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      getBatchOperationService: () =>
        new BatchOperationService(state.db, state.batchMonitoringQueue as any),
      getAdminDatabaseService: () => new AdminDatabaseService(state.db),
      getExplanationRegenerationService: () =>
        new ExplanationRegenerationService(state.db),
    };
  })
  .guard((app) => {
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
              .select([
                "id",
                "email",
                "firstName",
                "lastName",
                "is_admin",
                "createdAt",
              ])
              .execute();
          })
          .patch(
            "/user/:id/admin-status",
            async ({ params, body, store: { db } }) => {
              const result = await db
                .getOrCreateConnection()
                .updateTable("user")
                .set({ is_admin: body.is_admin })
                .where("id", "=", params.id)
                .executeTakeFirst();

              if (result.numUpdatedRows === 0n) {
                throw new Error(`User ${params.id} not found`);
              }

              return {
                success: true,
                message: `User ${params.id} admin status updated to ${body.is_admin}`,
              };
            },
            {
              body: t.Object({
                is_admin: t.Boolean(),
              }),
            },
          )

          .post(
            "/batch-explanations",
            async ({ body, currentUserId, store }) => {
              const batchOperationService = store.getBatchOperationService();

              if (body.type === "book") {
                // Support both bookId (legacy) and bookName (new)
                if (!body.bookId && !body.bookName) {
                  throw new Error(
                    "bookId or bookName is required for book batch",
                  );
                }

                // If bookName is provided, use it; otherwise fall back to bookId
                if (body.bookName) {
                  return await batchOperationService.generateBookBatchByName(
                    body.bookName,
                    body.bibleVersion,
                    body.explanationTypes as any,
                    body.model,
                    currentUserId,
                    body.skipExisting,
                  );
                }
                return await batchOperationService.generateBookBatch(
                  body.bookId,
                  body.bibleVersion,
                  body.explanationTypes as any,
                  body.model,
                  currentUserId,
                  body.skipExisting,
                );
              }
              if (body.type === "bible") {
                return await batchOperationService.generateBibleBatch(
                  body.bibleVersion,
                  body.explanationTypes as any,
                  body.model,
                  currentUserId,
                );
              }

              throw new Error("Invalid batch type");
            },
            {
              body: t.Object({
                type: t.Union([t.Literal("book"), t.Literal("bible")]),
                bookId: t.Optional(t.Number()),
                bookName: t.Optional(t.String()),
                bibleVersion: t.String(),
                model: t.String(),
                explanationTypes: t.Array(t.String()),
                skipExisting: t.Optional(t.Boolean()),
              }),
            },
          )
          .get(
            "/batch/:batchJobId",
            async ({ params, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.getBatchStatus(
                params.batchJobId,
              );
            },
            {
              params: t.Object({
                batchJobId: t.String(),
              }),
            },
          )
          .delete(
            "/batch/:batchJobId",
            async ({ params, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.cancelBatch(params.batchJobId);
            },
            {
              params: t.Object({
                batchJobId: t.String(),
              }),
            },
          )
          .get(
            "/batch-history",
            async ({ query, currentUserId, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.getAllBatches(
                query.limit ? Number(query.limit) : 50,
                query.offset ? Number(query.offset) : 0,
                query.adminOnly === "true" ? currentUserId : undefined,
              );
            },
            {
              query: t.Object({
                limit: t.Optional(t.String()),
                offset: t.Optional(t.String()),
                adminOnly: t.Optional(t.String()),
              }),
            },
          )

          .delete("/explanation/:id", async ({ params, store }) => {
            const adminDatabaseService = store.getAdminDatabaseService();
            return await adminDatabaseService.deleteExplanation(params.id);
          })
          .post(
            "/explanation/regenerate",
            async ({ body, store, currentUserId }) => {
              const adminDatabaseService = store.getAdminDatabaseService();
              return await adminDatabaseService.regenerateExplanation(
                body.bookId,
                body.chapterNumber,
                body.explanationType as any,
                body.bibleVersion,
                currentUserId,
              );
            },
            {
              body: t.Object({
                bookId: t.Number(),
                chapterNumber: t.Number(),
                explanationType: t.String(),
                bibleVersion: t.String(),
              }),
            },
          )
          .post(
            "/explanation/regenerate/:regenerationId/generate",
            async ({ params, body, store, currentUserId }) => {
              const explanationRegenerationService =
                store.getExplanationRegenerationService();
              return await explanationRegenerationService.generateNewExplanation(
                params.regenerationId,
                body.bookId,
                body.chapterNumber,
                body.explanationType as any,
                body.bibleVersion,
                body.model,
                currentUserId,
              );
            },
            {
              body: t.Object({
                bookId: t.Number(),
                chapterNumber: t.Number(),
                explanationType: t.String(),
                bibleVersion: t.String(),
                model: t.String(),
              }),
            },
          )
          .get(
            "/explanation/regenerate/:regenerationId/comparison",
            async ({ params, store }) => {
              const adminDatabaseService = store.getAdminDatabaseService();
              return await adminDatabaseService.getExplanationComparison(
                params.regenerationId,
              );
            },
          )
          .post(
            "/explanation/regenerate/:regenerationId/choose",
            async ({ params, body, store, currentUserId }) => {
              const adminDatabaseService = store.getAdminDatabaseService();
              return await adminDatabaseService.chooseExplanationVersion(
                params.regenerationId,
                body.chosenExplanationId,
                currentUserId,
              );
            },
            {
              body: t.Object({
                chosenExplanationId: t.Number(),
              }),
            },
          )
          .delete(
            "/explanations/bulk",
            async ({ body, store }) => {
              const adminDatabaseService = store.getAdminDatabaseService();
              return await adminDatabaseService.bulkDeleteExplanations(body);
            },
            {
              body: t.Object({
                bookId: t.Optional(t.Number()),
                explanationType: t.Optional(t.String()),
                bibleVersion: t.Optional(t.String()),
                dateRange: t.Optional(
                  t.Object({
                    from: t.String(),
                    to: t.String(),
                  }),
                ),
              }),
            },
          )
          .get("/explanation/:id/history", async ({ params, store }) => {
            const adminDatabaseService = store.getAdminDatabaseService();
            return await adminDatabaseService.getExplanationHistory(params.id);
          })
          .get("/stats", async ({ store }) => {
            const adminDatabaseService = store.getAdminDatabaseService();
            return await adminDatabaseService.getExplanationStats();
          })

          .get("/prompts/system", async ({ store: { db } }) => {
            const prompt = await db
              .getOrCreateConnection()
              .selectFrom("prompts")
              .where("status", "=", "active" as any)
              .select(["prompt", "status"])
              .executeTakeFirst();
            return (
              prompt || {
                prompt: "No active system prompt found",
                status: "inactive",
              }
            );
          })
          .get("/prompts/user", async ({ store: { db } }) => {
            const prompts = await db
              .getOrCreateConnection()
              .selectFrom("user_prompt_templates")
              .selectAll()
              .execute();
            return prompts;
          })
          .put(
            "/prompts/system",
            async ({ body, store: { db } }) => {
              await db
                .getOrCreateConnection()
                .updateTable("prompts")
                .set({ status: "inactive" as any })
                .where("status", "=", "active" as any)
                .execute();

              await db
                .getOrCreateConnection()
                .insertInto("prompts")
                .values({
                  prompt: body.prompt,
                  status: "active" as any,
                })
                .execute();

              return { success: true, message: "System prompt updated" };
            },
            {
              body: t.Object({
                prompt: t.String(),
              }),
            },
          )
          .put(
            "/prompts/user/:id",
            async ({ params, body, store: { db } }) => {
              const result = await db
                .getOrCreateConnection()
                .updateTable("user_prompt_templates")
                .set({ prompt_template: body.prompt_template })
                .where("id", "=", Number(params.id))
                .executeTakeFirst();

              if (result.numUpdatedRows === 0n) {
                throw new Error(`User prompt template ${params.id} not found`);
              }

              return {
                success: true,
                message: `User prompt template ${params.id} updated`,
              };
            },
            {
              body: t.Object({
                prompt_template: t.String(),
              }),
            },
          )
          .post(
            "/prompts/user",
            async ({ body, store: { db } }) => {
              const result = await db
                .getOrCreateConnection()
                .insertInto("user_prompt_templates")
                .values({
                  template_name: body.template_name,
                  explanation_type: body.explanation_type as any,
                  prompt_template: body.prompt_template,
                  status: "active" as any,
                })
                .returning("id")
                .executeTakeFirst();

              return {
                success: true,
                id: result?.id,
                message: "User prompt template created",
              };
            },
            {
              body: t.Object({
                template_name: t.String(),
                explanation_type: t.String(),
                prompt_template: t.String(),
              }),
            },
          )

          .get("/commentary/grades", async ({ store: { db } }) => {
            return {
              message: "Commentary grading feature - to be implemented",
              grades: [],
              stats: {
                total: 0,
                averageGrade: 0,
                gradingCriteria: [],
              },
            };
          })
          .post(
            "/commentary/grade",
            async ({ body, store: { db } }) => {
              return {
                success: true,
                grade: 0,
                message: "Commentary grading - to be implemented",
              };
            },
            {
              body: t.Object({
                explanationId: t.String(),
                criteria: t.Array(t.String()),
              }),
            },
          );
      });
  });

// Export the plugin
export default plugin;
export type AdminPlugin = typeof plugin;

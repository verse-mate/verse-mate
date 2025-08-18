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
      batchOperationService: new BatchOperationService(
        state.db,
        state.batchMonitoringQueue as any,
      ),
      adminDatabaseService: new AdminDatabaseService(state.db),
      explanationRegenerationService: new ExplanationRegenerationService(
        state.db,
      ),
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
              console.log(
                `[TEMPLATE] Toggle admin status for user ${params.id}:`,
                body,
              );
              return {
                success: true,
                message: `User ${params.id} admin status updated`,
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
              const { batchOperationService } = store;

              if (body.type === "book") {
                if (!body.bookId) {
                  throw new Error("bookId is required for book batch");
                }
                return await batchOperationService.generateBookBatch(
                  body.bookId,
                  body.bibleVersion,
                  body.explanationTypes as any,
                  body.model,
                  currentUserId,
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
                bibleVersion: t.String(),
                model: t.String(),
                explanationTypes: t.Array(t.String()),
              }),
            },
          )
          .get(
            "/batch/:batchJobId",
            async ({ params, store }) => {
              const { batchOperationService } = store;
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
              const { batchOperationService } = store;
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
              const { batchOperationService } = store;
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

          .delete(
            "/explanation/:id",
            async ({ params, store: { adminDatabaseService } }) => {
              return await adminDatabaseService.deleteExplanation(params.id);
            },
          )
          .post(
            "/explanation/regenerate",
            async ({
              body,
              store: { adminDatabaseService },
              currentUserId,
            }) => {
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
            async ({
              params,
              body,
              store: { explanationRegenerationService },
              currentUserId,
            }) => {
              return await explanationRegenerationService.generateNewExplanation(
                params.regenerationId,
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
          .get(
            "/explanation/regenerate/:regenerationId/comparison",
            async ({ params, store: { adminDatabaseService } }) => {
              return await adminDatabaseService.getExplanationComparison(
                params.regenerationId,
              );
            },
          )
          .post(
            "/explanation/regenerate/:regenerationId/choose",
            async ({
              params,
              body,
              store: { adminDatabaseService },
              currentUserId,
            }) => {
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
            async ({ body, store: { adminDatabaseService } }) => {
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
          .get(
            "/explanation/:id/history",
            async ({ params, store: { adminDatabaseService } }) => {
              return await adminDatabaseService.getExplanationHistory(
                params.id,
              );
            },
          )
          .get("/stats", async ({ store: { adminDatabaseService } }) => {
            return await adminDatabaseService.getExplanationStats();
          })

          .get("/prompts/system", async ({ store: { db } }) => {
            console.log("[TEMPLATE] Getting active system prompt");
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
            console.log("[TEMPLATE] Getting all user prompt templates");
            return [
              {
                id: 1,
                template_name: "summary",
                explanation_type: "summary",
                prompt_template: "Template placeholder...",
              },
              {
                id: 2,
                template_name: "detailed",
                explanation_type: "detailed",
                prompt_template: "Template placeholder...",
              },
            ];
          })
          .put(
            "/prompts/system",
            async ({ body, store: { db } }) => {
              console.log("[TEMPLATE] Updating system prompt:", body);
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
              console.log(
                `[TEMPLATE] Updating user prompt template ${params.id}:`,
                body,
              );
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
              console.log(
                "[TEMPLATE] Creating new user prompt template:",
                body,
              );
              return {
                success: true,
                id: Math.floor(Math.random() * 1000),
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
            console.log("[TEMPLATE] Getting commentary grading data");
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
              console.log("[TEMPLATE] Grading commentary:", body);
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

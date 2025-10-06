import bearer from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import PromptStatusEnum from "../../../database/src/models/public/PromptStatusEnum";
import { adminGuard } from "../auth/admin.utils";
import { authDerive, authGuard } from "../auth/auth.utils";
import { BibleRepository } from "../bible/repository/bible.repository";
import { BibleService } from "../bible/services/bible.service";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import shared from "../shared/shared.plugin";
import { TopicService } from "../topics/services/topic.service";
import { AdminDatabaseService } from "./services/admin-database.service";
import { AdminPromptService } from "./services/admin-prompt.service";
import { BatchOperationService } from "./services/batch-operations.service";
import { ExplanationRegenerationService } from "./services/explanation-regeneration.service";
import adminTopicPlugin from "./topics.plugin";

const plugin = new Elysia()
  .use(shared)
  .state("batchProcessingQueue", batchProcessingQueue)
  .state((state) => {
    const bibleRepository = new BibleRepository(state.db);
    return {
      ...state,
      getBatchOperationService: () =>
        new BatchOperationService(
          state.db,
          state.batchMonitoringQueue as any,
          state.batchProcessingQueue as any,
        ),
      getAdminDatabaseService: () => new AdminDatabaseService(state.db),
      getExplanationRegenerationService: () =>
        new ExplanationRegenerationService(state.db),
      getAdminPromptService: () => new AdminPromptService(state.db),
      getBibleService: () => new BibleService(state.db, bibleRepository),
      topicService: new TopicService(state.db),
    };
  })
  .guard((app) =>
    app
      .use(bearer())
      .resolve({ as: "scoped" }, authDerive)
      .group("/user", (app) =>
        app.guard(authGuard).patch(
          "/preferences",
          async ({ body, currentUserId, store: { db } }) => {
            const result = await db
              .getOrCreateConnection()
              .updateTable("user")
              .set({ preferred_language: body.preferred_language })
              .where("id", "=", currentUserId)
              .executeTakeFirst();

            if (result.numUpdatedRows === BigInt(0)) {
              throw new Error(`User ${currentUserId} not found`);
            }

            return {
              success: true,
              message: `User ${currentUserId} preferences updated`,
            };
          },
          {
            body: t.Object({
              preferred_language: t.Union([t.String(), t.Null()]),
            }),
          },
        ),
      )
      .group("/admin", (app) =>
        app
          .guard(adminGuard)
          .get("/explanations/languages", async ({ store }) => {
            const bibleService = store.getBibleService();
            return await bibleService.getAvailableExplanationLanguages();
          })
          .post("/explanations/refresh-language-stats", async ({ store }) => {
            const bibleService = store.getBibleService();
            return await bibleService.refreshLanguageStats();
          })
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
          }),
      ),
  )
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

              if (result.numUpdatedRows === BigInt(0)) {
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
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
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
                    body.skipExisting || false,
                    body.effort || "medium",
                  );
                }
                if (!body.bookId) {
                  throw new Error("bookId is required");
                }
                return await batchOperationService.generateBookBatch(
                  body.bookId,
                  body.bibleVersion,
                  body.explanationTypes as any,
                  body.model,
                  currentUserId,
                  body.skipExisting || false,
                  body.effort || "medium",
                );
              }
              if (body.type === "bible") {
                return await batchOperationService.generateBibleBatch(
                  body.bibleVersion,
                  body.explanationTypes as any,
                  body.model,
                  currentUserId,
                  body.effort || "medium",
                  body.skipExisting || false,
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
                effort: t.Optional(
                  t.Union([
                    t.Literal("low"),
                    t.Literal("medium"),
                    t.Literal("high"),
                  ]),
                ),
              }),
            },
          )
          .post(
            "/batch-topic-discovery",
            async ({ body, currentUserId, store }) => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.generateTopicDiscoveryBatch(
                body.category,
                body.model,
                currentUserId,
                body.effort || "medium",
              );
            },
            {
              body: t.Object({
                category: t.String(),
                model: t.String(),
                effort: t.Optional(
                  t.Union([
                    t.Literal("low"),
                    t.Literal("medium"),
                    t.Literal("high"),
                  ]),
                ),
              }),
            },
          )
          .post(
            "/batch-rephrase",
            async ({ body, currentUserId, store }) => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.generateRephraseBatch(
                body.model,
                currentUserId,
                body.type,
                body.bibleVersion,
                body.effort || "medium",
                body.bookName,
              );
            },
            {
              body: t.Object({
                type: t.Union([t.Literal("book"), t.Literal("bible")]),
                bookName: t.Optional(t.String()),
                model: t.String(),
                effort: t.Optional(
                  t.Union([
                    t.Literal("low"),
                    t.Literal("medium"),
                    t.Literal("high"),
                  ]),
                ),
                bibleVersion: t.String(),
              }),
            },
          )
          .post(
            "/batch-translate",
            async ({ body, currentUserId, store }) => {
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.generateTranslateBatch(
                body.model,
                currentUserId,
                body.type,
                body.source_language_code,
                body.target_language_code,
                body.explanationTypes,
                body.skipExisting || false,
                body.effort || "medium",
                body.bookName,
              );
            },
            {
              body: t.Object({
                type: t.Union([t.Literal("book"), t.Literal("bible")]),
                bookName: t.Optional(t.String()),
                model: t.String(),
                effort: t.Optional(
                  t.Union([
                    t.Literal("low"),
                    t.Literal("medium"),
                    t.Literal("high"),
                  ]),
                ),
                source_language_code: t.String(),
                target_language_code: t.String(),
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
                query.adminOnly === "true"
                  ? currentUserId || undefined
                  : undefined,
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
          .get(
            "/batch-children/:parentId",
            async ({ params, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.getBatchChildren(
                Number(params.parentId),
              );
            },
            {
              params: t.Object({
                parentId: t.String(),
              }),
            },
          )
          .post(
            "/monitor-bible-batch/:parentId",
            async ({ params, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.monitorBibleBatch(
                Number(params.parentId),
              );
            },
            {
              params: t.Object({
                parentId: t.String(),
              }),
            },
          )
          .post("/batches/monitor-all", async ({ store }) => {
            const batchOperationService = store.getBatchOperationService();
            return await batchOperationService.monitorAllActiveBatches();
          })
          .get(
            "/batch-summary/:parentId",
            async ({ params, store }) => {
              const batchOperationService = store.getBatchOperationService();
              return await batchOperationService.getBatchSummary(
                Number(params.parentId),
              );
            },
            {
              params: t.Object({
                parentId: t.String(),
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
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
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
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
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
              if (!currentUserId) {
                throw new Error("Unauthorized");
              }
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
          .post(
            "/explanations/set-active-as-default",
            async ({ body, store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.setActiveExplanationsAsDefault({
                ...body,
                language_code: body.languageCode,
              });
            },
            {
              body: t.Object({
                isBibleBatch: t.Boolean(),
                languageCode: t.String(),
                bookName: t.Optional(t.String()),
                chapter: t.Optional(t.Union([t.Number(), t.Literal("all")])),
              }),
            },
          )
          .post(
            "/explanations/set-defaults-active",
            async ({ body, store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.setDefaultExplanationsAsActive({
                ...body,
                language_code: body.languageCode,
              });
            },
            {
              body: t.Object({
                isBibleBatch: t.Boolean(),
                languageCode: t.String(),
                bookName: t.Optional(t.String()),
                chapter: t.Optional(t.Union([t.Number(), t.Literal("all")])),
              }),
            },
          )
          .post(
            "/explanations/set-specific-version-active",
            async ({ body, store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.setSpecificExplanationVersionAsActive({
                ...body,
                language_code: body.languageCode,
              });
            },
            {
              body: t.Object({
                isBibleBatch: t.Boolean(),
                languageCode: t.String(),
                bookName: t.Optional(t.String()),
                chapter: t.Optional(t.Union([t.Number(), t.Literal("all")])),
                version: t.Number(),
              }),
            },
          )
          .delete(
            "/explanations/inactive",
            async ({ body, store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.deleteInactiveExplanations({
                ...body,
                language_code: body.languageCode,
              });
            },
            {
              body: t.Object({
                isBibleBatch: t.Boolean(),
                languageCode: t.String(),
                bookName: t.Optional(t.String()),
                chapter: t.Optional(t.Union([t.Number(), t.Literal("all")])),
              }),
            },
          )
          .get("/explanation/:id/history", async ({ params, store }) => {
            const adminDatabaseService = store.getAdminDatabaseService();
            return await adminDatabaseService.getExplanationHistory(params.id);
          })
          .get(
            "/explanations",
            async ({ query, store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.getExplanationsByFilter({
                isBibleBatch: query.isBibleBatch === "true",
                language_code: query.languageCode,
                bookName: query.bookName,
                chapter: query.chapter ? Number(query.chapter) : "all",
                limit: query.limit ? Number(query.limit) : 50,
                offset: query.offset ? Number(query.offset) : 0,
              });
            },
            {
              query: t.Object({
                isBibleBatch: t.String(),
                languageCode: t.String(),
                bookName: t.Optional(t.String()),
                chapter: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                offset: t.Optional(t.String()),
              }),
            },
          )
          .get("/stats", async ({ store }) => {
            const adminDatabaseService = store.getAdminDatabaseService();
            return await adminDatabaseService.getExplanationStats();
          })
          .group("/prompts", (app) =>
            app
              // GET all prompts
              .get("/system", async ({ store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.getAllSystemPrompts();
              })
              .get("/user", async ({ store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.getAllUserPrompts();
              })
              .get("/explanation-types", async ({ store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.getAllExplanationTypes();
              })
              // CREATE prompts
              .post(
                "/system",
                async ({ body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.createSystemPrompt(body.prompt);
                },
                { body: t.Object({ prompt: t.String() }) },
              )
              .post(
                "/user",
                async ({ body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.createUserPrompt(
                    body.template_name,
                    body.explanation_type,
                    body.prompt_template,
                  );
                },
                {
                  body: t.Object({
                    template_name: t.String(),
                    explanation_type: t.Union([
                      t.Literal("summary"),
                      t.Literal("byline"),
                      t.Literal("detailed"),
                    ]),
                    prompt_template: t.String(),
                  }),
                },
              )
              // UPDATE prompts
              .put(
                "/system/:id",
                async ({ params, body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.updateSystemPrompt(
                    Number(params.id),
                    body.prompt,
                  );
                },
                {
                  body: t.Object({ prompt: t.String() }),
                  params: t.Object({ id: t.String() }),
                },
              )
              .put(
                "/user/:id",
                async ({ params, body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.updateUserPrompt(
                    Number(params.id),
                    body.prompt_template,
                  );
                },
                {
                  body: t.Object({ prompt_template: t.String() }),
                  params: t.Object({ id: t.String() }),
                },
              )
              // DELETE prompts
              .delete("/system/:id", async ({ params, store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.deleteSystemPrompt(Number(params.id));
              })
              .delete("/user/:id", async ({ params, store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.deleteUserPrompt(Number(params.id));
              })
              // SET STATUS of prompts
              .put(
                "/system/:id/status",
                async ({ params, body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.setSystemPromptStatus(
                    Number(params.id),
                    body.status,
                  );
                },
                {
                  body: t.Object({ status: t.Enum(PromptStatusEnum) }),
                  params: t.Object({ id: t.String() }),
                },
              )
              .put(
                "/user/:id/status",
                async ({ params, body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.setUserPromptStatus(
                    Number(params.id),
                    body.status,
                  );
                },
                {
                  body: t.Object({
                    status: t.Union([
                      t.Literal("active"),
                      t.Literal("inactive"),
                    ]),
                  }),
                  params: t.Object({ id: t.String() }),
                },
              )
              // RESTORE defaults
              .post("/restore-defaults", async ({ store }) => {
                const adminPromptService = store.getAdminPromptService();
                return adminPromptService.restoreDefaults();
              })
              // PLAYGROUND
              .post(
                "/playground",
                async ({ body, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.testPrompts(body);
                },
                {
                  body: t.Object({
                    system_prompt: t.String(),
                    user_prompt: t.String(),
                    book_name: t.String(),
                    chapter_number: t.Number(),
                    bible_version: t.String(),
                    model: t.String(),
                    effort: t.Union([
                      t.Literal("low"),
                      t.Literal("medium"),
                      t.Literal("high"),
                    ]),
                    send_chapter_context: t.Boolean(),
                  }),
                },
              )
              .get(
                "/explanation/existing",
                async ({ query, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.getExistingExplanation(
                    query.book_name,
                    Number(query.chapter_number),
                    query.bible_version,
                    query.explanation_type,
                  );
                },
                {
                  query: t.Object({
                    book_name: t.String(),
                    chapter_number: t.String(),
                    bible_version: t.String(),
                    explanation_type: t.String(),
                  }),
                },
              ),
          )

          .use(adminTopicPlugin)
          .get(
            "/commentary/grades",
            async ({ store }: { store: { db: any } }) => {
              return {
                message: "Commentary grading feature - to be implemented",
                grades: [],
                stats: {
                  total: 0,
                  averageGrade: 0,
                  gradingCriteria: [],
                },
              };
            },
          )
          .post(
            "/commentary/grade",
            async ({ body, store }: { body: any; store: { db: any } }) => {
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

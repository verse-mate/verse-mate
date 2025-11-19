import { Elysia, t } from "elysia";
import PromptStatusEnum from "../../../database/src/models/public/PromptStatusEnum";
import { adminGuard } from "../auth/admin.utils";
import { authDerive, authGuard } from "../auth/auth.utils";
import { BibleRepository } from "../bible/repository/bible.repository";
import { AutoHighlightService } from "../bible/services/auto-highlight.service";
import { BibleService } from "../bible/services/bible.service";
import { createErrorHandler } from "../common/error-handler";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import shared from "../shared/shared.plugin";
import { TopicService } from "../topics/services/topic.service";
import {
  AdminStatusUpdateSchema,
  BatchCancelSchema,
  BatchChildrenSchema,
  BatchHistorySchema,
  BatchOperationSchema,
  BatchStatusSchema,
  BatchSummarySchema,
  CommentaryGradeSchema,
  CommentaryGradesSchema,
  ExistingExplanationSchema,
  ExplanationChooseSchema,
  ExplanationComparisonSchema,
  ExplanationDeleteSchema,
  ExplanationGenerateSchema,
  ExplanationHistorySchema,
  ExplanationRegenerateSchema,
  ExplanationTypesSchema,
  ExplanationsBulkDeleteSchema,
  ExplanationsFilterSchema,
  ExplanationsSetActiveSchema,
  LanguagesArraySchema,
  PlaygroundSchema,
  PromptCreateSchema,
  PromptDeleteSchema,
  PromptStatusUpdateSchema,
  PromptUpdateSchema,
  RestoreDefaultsSchema,
  StatsSchema,
  SystemPromptsSchema,
  UserPreferencesUpdateSchema,
  UserPromptsSchema,
  UsersArraySchema,
} from "./schemas/admin-response.schema";
import { AdminDatabaseService } from "./services/admin-database.service";
import { AdminPromptService } from "./services/admin-prompt.service";
import { BatchOperationService } from "./services/batch-operations.service";
import { ExplanationRegenerationService } from "./services/explanation-regeneration.service";
import adminTopicPlugin from "./topics.plugin";

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("admin plugin"))
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
      getAutoHighlightService: () =>
        new AutoHighlightService(state.db, bibleRepository),
    };
  })
  .guard(authGuard, (app) =>
    app
      .resolve({ as: "scoped" }, authDerive)
      .group("/user", (app) =>
        app.patch(
          "/preferences",
          async ({ body, currentUserId, store: { db } }) => {
            const result = await db
              .getOrCreateConnection()
              .updateTable("user")
              .set({ preferred_language: body.preferred_language })
              .where("id", "=", currentUserId)
              .executeTakeFirst();

            if (result.numUpdatedRows === BigInt(0)) {
              throw new NotFoundError(`User ${currentUserId} not found`);
            }

            return {
              success: true,
              message: `User ${currentUserId} preferences updated`,
            };
          },
          {
            body: t.Object({
              preferred_language: t.Optional(t.String()),
            }),
            response: {
              200: UserPreferencesUpdateSchema,
              ...StandardErrorResponses,
            },
          },
        ),
      )
      .group("/admin", (app) =>
        app
          .guard(adminGuard)
          .get(
            "/explanations/languages",
            async ({ store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.getAvailableExplanationLanguages();
            },
            {
              response: {
                200: LanguagesArraySchema,
                ...StandardErrorResponses,
              },
            },
          )
          .post(
            "/explanations/refresh-language-stats",
            async ({ store }) => {
              const bibleService = store.getBibleService();
              return await bibleService.refreshLanguageStats();
            },
            {
              response: {
                200: StatsSchema,
                ...StandardErrorResponses,
              },
            },
          )
          .get(
            "/users",
            async ({ store: { db } }) => {
              const users = await db
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

              // Serialize Date objects to ISO strings
              return users.map((user) => ({
                ...user,
                createdAt: user.createdAt.toISOString(),
              }));
            },
            {
              response: {
                200: UsersArraySchema,
                ...StandardErrorResponses,
              },
            },
          ),
      ),
  )
  .guard(authGuard, (app) => {
    return app
      .resolve({ as: "scoped" }, authDerive)
      .guard(adminGuard)
      .group("/admin", (app) => {
        return (
          app
            .get(
              "/users",
              async ({ store: { db } }) => {
                const users = await db
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

                // Serialize Date objects to ISO strings
                return users.map((user) => ({
                  ...user,
                  createdAt: user.createdAt.toISOString(),
                }));
              },
              {
                response: {
                  200: UsersArraySchema,
                  ...StandardErrorResponses,
                },
              },
            )
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
                  throw new NotFoundError(`User ${params.id} not found`);
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
                response: {
                  200: AdminStatusUpdateSchema,
                  ...StandardErrorResponses,
                },
              },
            )

            .post(
              "/batch-explanations",
              async ({ body, currentUserId, store }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("User authentication required");
                }
                const batchOperationService = store.getBatchOperationService();

                if (body.type === "book") {
                  // Support both bookId (legacy) and bookName (new)
                  if (!body.bookId && !body.bookName) {
                    throw new ValidationError(
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
                    throw new ValidationError("bookId is required");
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

                throw new ValidationError("Invalid batch type");
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
                response: {
                  200: BatchOperationSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/batch-topic-references",
              async ({ body, currentUserId, store }) => {
                if (!currentUserId) {
                  throw new Error("Unauthorized");
                }
                const batchOperationService = store.getBatchOperationService();
                return await batchOperationService.generateTopicReferencesBatch(
                  body.model,
                  currentUserId,
                  body.effort || "medium",
                  body.category,
                  body.topicId,
                  body.skipExisting || false,
                );
              },
              {
                body: t.Object({
                  model: t.String(),
                  effort: t.Optional(
                    t.Union([
                      t.Literal("low"),
                      t.Literal("medium"),
                      t.Literal("high"),
                    ]),
                  ),
                  category: t.Optional(t.String()), // Add optional category parameter
                  topicId: t.Optional(t.String()), // Add optional topicId parameter
                  skipExisting: t.Optional(t.Boolean()),
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
                  body.model,
                  currentUserId,
                  body.effort || "medium",
                  body.category,
                );
              },
              {
                body: t.Object({
                  category: t.Optional(t.String()),
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
                  throw new UnauthorizedError("User authentication required");
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
                response: {
                  200: BatchOperationSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/batch-topic-explanations",
              async ({ body, currentUserId, store, set }) => {
                if (!currentUserId) {
                  set.status = 401;
                  return { error: "Unauthorized" };
                }
                try {
                  const batchOperationService =
                    store.getBatchOperationService();
                  return await batchOperationService.generateTopicExplanationsBatch(
                    body.model,
                    currentUserId,
                    body.languageCode,
                    body.explanationTypes,
                    body.effort || "medium",
                    body.category,
                    body.topicId,
                    body.includeReferencesInSummary || false,
                    body.includeReferencesInDetailed || false,
                  );
                } catch (error: any) {
                  console.error(
                    "[PLUGIN] Caught error from BatchOperationService:",
                    error.message,
                  );
                  set.status = 400;
                  return { error: error.message };
                }
              },
              {
                body: t.Object({
                  model: t.String(),
                  languageCode: t.String(),
                  explanationTypes: t.Optional(t.Array(t.String())),
                  effort: t.Optional(
                    t.Union([
                      t.Literal("low"),
                      t.Literal("medium"),
                      t.Literal("high"),
                    ]),
                  ),
                  category: t.Optional(t.String()),
                  topicId: t.Optional(t.String()),
                  includeReferencesInSummary: t.Optional(t.Boolean()),
                  includeReferencesInDetailed: t.Optional(t.Boolean()),
                }),
              },
            )
            .post(
              "/batch-translate",
              async ({ body, currentUserId, store }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("User authentication required");
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
                response: {
                  200: BatchOperationSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .get(
              "/batch/:batchJobId",
              async ({ params, store }) => {
                const batchOperationService = store.getBatchOperationService();
                const batchStatus = await batchOperationService.getBatchStatus(
                  params.batchJobId,
                );
                return {
                  id: batchStatus.id,
                  status: batchStatus.status,
                  progress:
                    (batchStatus.request_counts?.completed || 0) /
                    (batchStatus.request_counts?.total || 1),
                  total: batchStatus.request_counts?.total || 0,
                  completed: batchStatus.request_counts?.completed || 0,
                  failed: batchStatus.request_counts?.failed || 0,
                };
              },
              {
                params: t.Object({
                  batchJobId: t.String(),
                }),
                response: {
                  200: BatchStatusSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .delete(
              "/batch/:batchJobId",
              async ({ params, store }) => {
                const batchOperationService = store.getBatchOperationService();
                const result = await batchOperationService.cancelBatch(
                  params.batchJobId,
                );
                // cancelBatch can return either {success, message} or an openAI batch object
                if (typeof result === "object" && "success" in result) {
                  return result;
                }
                return {
                  success: true,
                  message: `Batch ${params.batchJobId} cancelled successfully`,
                };
              },
              {
                params: t.Object({
                  batchJobId: t.String(),
                }),
                response: {
                  200: BatchCancelSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: BatchHistorySchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: BatchChildrenSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: BatchOperationSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/batches/monitor-all",
              async ({ store }) => {
                const batchOperationService = store.getBatchOperationService();
                return await batchOperationService.monitorAllActiveBatches();
              },
              {
                response: {
                  200: BatchOperationSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/batch-retrieve-errors/:batchId",
              async ({ params, store }) => {
                const batchOperationService = store.getBatchOperationService();
                return await batchOperationService.retrieveAndSaveBatchErrors(
                  params.batchId,
                );
              },
              {
                params: t.Object({
                  batchId: t.String(),
                }),
                response: {
                  200: t.Object({
                    success: t.Boolean(),
                    message: t.String(),
                    errorContent: t.Optional(t.String()),
                  }),
                  ...StandardErrorResponses,
                },
              },
            )
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
                response: {
                  200: BatchSummarySchema,
                  ...StandardErrorResponses,
                },
              },
            )

            .delete(
              "/explanation/:id",
              async ({ params, store }) => {
                const adminDatabaseService = store.getAdminDatabaseService();
                return await adminDatabaseService.deleteExplanation(params.id);
              },
              {
                params: t.Object({
                  id: t.String(),
                }),
                response: {
                  200: ExplanationDeleteSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/explanation/regenerate",
              async ({ body, store, currentUserId }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("User authentication required");
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
                response: {
                  200: ExplanationRegenerateSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/explanation/regenerate/:regenerationId/generate",
              async ({ params, body, store, currentUserId }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("User authentication required");
                }
                const explanationRegenerationService =
                  store.getExplanationRegenerationService();
                return await explanationRegenerationService.generateNewExplanation(
                  {
                    regenerationId: params.regenerationId,
                    bookId: body.bookId,
                    chapterNumber: body.chapterNumber,
                    explanationType: body.explanationType as any,
                    bibleVersion: body.bibleVersion,
                    model: body.model,
                  },
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
                response: {
                  200: ExplanationGenerateSchema,
                  ...StandardErrorResponses,
                },
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
              {
                params: t.Object({
                  regenerationId: t.String(),
                }),
                response: {
                  200: ExplanationComparisonSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/explanation/regenerate/:regenerationId/choose",
              async ({ params, body, store, currentUserId }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("User authentication required");
                }
                const adminDatabaseService = store.getAdminDatabaseService();
                return await adminDatabaseService.chooseExplanationVersion(
                  params.regenerationId,
                  body.chosenExplanationId,
                  currentUserId,
                );
              },
              {
                params: t.Object({
                  regenerationId: t.String(),
                }),
                body: t.Object({
                  chosenExplanationId: t.Number(),
                }),
                response: {
                  200: ExplanationChooseSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: ExplanationsBulkDeleteSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: ExplanationsSetActiveSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: ExplanationsSetActiveSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/explanations/set-specific-version-active",
              async ({ body, store }) => {
                const bibleService = store.getBibleService();
                return await bibleService.setSpecificExplanationVersionAsActive(
                  {
                    ...body,
                    language_code: body.languageCode,
                  },
                );
              },
              {
                body: t.Object({
                  isBibleBatch: t.Boolean(),
                  languageCode: t.String(),
                  bookName: t.Optional(t.String()),
                  chapter: t.Optional(t.Union([t.Number(), t.Literal("all")])),
                  version: t.Number(),
                }),
                response: {
                  200: ExplanationsSetActiveSchema,
                  ...StandardErrorResponses,
                },
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
                response: {
                  200: ExplanationsBulkDeleteSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .get(
              "/explanation/:id/history",
              async ({ params, store }) => {
                const adminDatabaseService = store.getAdminDatabaseService();
                return await adminDatabaseService.getExplanationHistory(
                  params.id,
                );
              },
              {
                params: t.Object({
                  id: t.String(),
                }),
                response: {
                  200: ExplanationHistorySchema,
                  ...StandardErrorResponses,
                },
              },
            )
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
                response: {
                  200: ExplanationsFilterSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .get(
              "/stats",
              async ({ store }) => {
                const adminDatabaseService = store.getAdminDatabaseService();
                return await adminDatabaseService.getExplanationStats();
              },
              {
                response: {
                  200: StatsSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .group("/prompts", (app) =>
              app
                // GET all prompts
                .get(
                  "/system",
                  async ({ store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.getAllSystemPrompts();
                  },
                  {
                    response: {
                      200: SystemPromptsSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                .get(
                  "/user",
                  async ({ store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.getAllUserPrompts();
                  },
                  {
                    response: {
                      200: UserPromptsSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                .get(
                  "/explanation-types",
                  async ({ store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.getAllExplanationTypes();
                  },
                  {
                    response: {
                      200: ExplanationTypesSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                // CREATE prompts
                .post(
                  "/system",
                  async ({ body, store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.createSystemPrompt(body.prompt);
                  },
                  {
                    body: t.Object({ prompt: t.String() }),
                    response: {
                      200: PromptCreateSchema,
                      ...StandardErrorResponses,
                    },
                  },
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
                    response: {
                      200: PromptCreateSchema,
                      ...StandardErrorResponses,
                    },
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
                    response: {
                      200: PromptUpdateSchema,
                      ...StandardErrorResponses,
                    },
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
                    response: {
                      200: PromptUpdateSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                // DELETE prompts
                .delete(
                  "/system/:id",
                  async ({ params, store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.deleteSystemPrompt(
                      Number(params.id),
                    );
                  },
                  {
                    params: t.Object({
                      id: t.String(),
                    }),
                    response: {
                      200: PromptDeleteSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                .delete(
                  "/user/:id",
                  async ({ params, store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.deleteUserPrompt(
                      Number(params.id),
                    );
                  },
                  {
                    params: t.Object({
                      id: t.String(),
                    }),
                    response: {
                      200: PromptDeleteSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
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
                    response: {
                      200: PromptStatusUpdateSchema,
                      ...StandardErrorResponses,
                    },
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
                    response: {
                      200: PromptStatusUpdateSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
                // RESTORE defaults
                .post(
                  "/restore-defaults",
                  async ({ store }) => {
                    const adminPromptService = store.getAdminPromptService();
                    return adminPromptService.restoreDefaults();
                  },
                  {
                    response: {
                      200: RestoreDefaultsSchema,
                      ...StandardErrorResponses,
                    },
                  },
                )
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
                    response: {
                      200: PlaygroundSchema,
                      ...StandardErrorResponses,
                    },
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
                    response: {
                      200: ExistingExplanationSchema,
                      ...StandardErrorResponses,
                    },
                  },
                ),
            )

            .use(adminTopicPlugin)
            // Auto-highlight admin endpoints
            .post(
              "/batch-auto-highlights",
              async ({
                body,
                currentUserId,
                store: { getBatchOperationService, db },
                set,
              }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("Authentication required");
                }

                if (body.type === "book" && !body.bookName) {
                  set.status = 400;
                  return {
                    success: false,
                    message: "bookName is required when type is 'book'",
                  };
                }
                if (body.type === "bible" && body.bookName) {
                  set.status = 400;
                  return {
                    success: false,
                    message:
                      "bookName must not be provided when type is 'bible'",
                  };
                }

                // Validate book existence when type is 'book'
                if (body.type === "book" && body.bookName) {
                  const book = await db
                    .getOrCreateConnection()
                    .selectFrom("books")
                    .where("name", "=", body.bookName)
                    .select("book_id")
                    .executeTakeFirst();
                  if (!book) {
                    set.status = 400;
                    return {
                      success: false,
                      message: `Unknown book: ${body.bookName}`,
                    };
                  }
                }

                const service = getBatchOperationService();
                const result = await service.generateHighlightBatch(
                  body.model,
                  currentUserId,
                  body.effort,
                  body.type === "book" ? body.bookName : undefined,
                );

                return { success: true, data: result };
              },
              {
                body: t.Object({
                  type: t.Union([t.Literal("bible"), t.Literal("book")]),
                  model: t.String(),
                  effort: t.Union([
                    t.Literal("low"),
                    t.Literal("medium"),
                    t.Literal("high"),
                  ]),
                  bookName: t.Optional(t.String()),
                }),
              },
            )
            .get(
              "/highlight-themes/all",
              async ({ currentUserId, store: { getAutoHighlightService } }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("Authentication required");
                }

                const service = getAutoHighlightService();
                const themes = await service.getAllThemes();

                return { success: true, data: themes };
              },
            )
            .patch(
              "/highlight-themes/:theme_id",
              async ({
                params,
                body,
                currentUserId,
                store: { getAutoHighlightService },
                set,
              }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("Authentication required");
                }
                const themeId = Number.parseInt(params.theme_id, 10);
                if (!Number.isFinite(themeId)) {
                  set.status = 400;
                  return { success: false, message: "Invalid theme_id" };
                }
                const service = getAutoHighlightService();
                await service.updateThemeActiveStatus(themeId, body.is_active);
                return { success: true };
              },
              {
                params: t.Object({
                  theme_id: t.String(),
                }),
                body: t.Object({
                  is_active: t.Boolean(),
                }),
              },
            )
            .get(
              "/auto-highlight-settings/default-relevance",
              async ({ currentUserId, store: { getAutoHighlightService } }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("Authentication required");
                }

                const service = getAutoHighlightService();
                const relevance = await service.getGlobalDefaultRelevance();

                return {
                  success: true,
                  data: { default_relevance: relevance },
                };
              },
            )
            .patch(
              "/auto-highlight-settings/default-relevance",
              async ({
                body,
                currentUserId,
                store: { getAutoHighlightService },
              }) => {
                if (!currentUserId) {
                  throw new UnauthorizedError("Authentication required");
                }

                const service = getAutoHighlightService();
                await service.updateGlobalDefaultRelevance(
                  body.default_relevance,
                );

                return { success: true };
              },
              {
                body: t.Object({
                  default_relevance: t.Number(),
                }),
              },
            )
            .get(
              "/commentary/grades",
              async ({ store: { db: _db } }) => {
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
              {
                response: {
                  200: CommentaryGradesSchema,
                  ...StandardErrorResponses,
                },
              },
            )
            .post(
              "/commentary/grade",
              async ({ body: _body, store: { db: _db } }) => {
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
                response: {
                  200: CommentaryGradeSchema,
                  ...StandardErrorResponses,
                },
              },
            )
        );
      });
  });

// Export the plugin
export default plugin;
export type AdminPlugin = typeof plugin;

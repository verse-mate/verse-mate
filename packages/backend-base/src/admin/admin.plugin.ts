import bearer from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import PromptStatusEnum from "../../../database/src/models/public/PromptStatusEnum";
import { adminGuard } from "../auth/admin.utils";
import { authDerive, authGuard } from "../auth/auth.utils";
import { BibleRepository } from "../bible/repository/bible.repository";
import { BibleService } from "../bible/services/bible.service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import {
  AuthErrors,
  ErrorResponse,
  StandardErrors,
} from "../common/response-models";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import shared from "../shared/shared.plugin";
import { AdminDatabaseService } from "./services/admin-database.service";
import { AdminPromptService } from "./services/admin-prompt.service";
import { BatchOperationService } from "./services/batch-operations.service";
import { ExplanationRegenerationService } from "./services/explanation-regeneration.service";

// Response Schemas
const SuccessMessageResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

const UsersListResponse = t.Array(t.Any());

const LanguageResponse = t.Object({
  language_code: t.String(),
  name: t.String(),
  native_name: t.String(),
  explanation_count: t.Number(),
});

const LanguagesListResponse = t.Array(LanguageResponse);

const LanguageStatsResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

const BatchOperationResponse = t.Object({
  batchJobId: t.String(),
  message: t.String(),
  totalVerses: t.Number(),
});

const BatchStatusResponse = t.Object({
  id: t.String(),
  status: t.String(),
  progress: t.Number(),
  total: t.Number(),
  completed: t.Number(),
  failed: t.Number(),
});

const BatchListResponse = t.Array(t.Any());

const BatchChildrenResponse = t.Array(t.Any());

const BatchSummaryResponse = t.Any();

const MonitorBatchResponse = t.Any();

const DeleteExplanationResponse = t.Any();

const RegenerateExplanationResponse = t.Object({
  regenerationId: t.Number(),
  message: t.String(),
});

const GenerateExplanationResponse = t.Object({
  success: t.Boolean(),
  explanationId: t.Number(),
  regenerationId: t.Number(),
});

const ExplanationComparisonResponse = t.Any();

const ChooseVersionResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

const BulkDeleteResponse = t.Any();

const SetActiveDefaultResponse = t.Any();

const ExplanationHistoryResponse = t.Any();

const ExplanationsFilterResponse = t.Object({
  explanations: t.Array(t.Any()),
  total: t.Number(),
});

const StatsResponse = t.Any();

const SystemPromptsListResponse = t.Array(t.Any());

const UserPromptsListResponse = t.Array(t.Any());

const ExplanationTypesResponse = t.Array(t.String());

const CreatePromptResponse = t.Object({
  id: t.Number(),
  message: t.String(),
});

const UpdatePromptResponse = t.Any();

const DeletePromptResponse = t.Any();

const PromptStatusResponse = t.Any();

const RestoreDefaultsResponse = t.Any();

const PlaygroundResponse = t.Any();

const ExistingExplanationResponse = t.Any();

const CommentaryGradesResponse = t.Object({
  message: t.String(),
  grades: t.Array(t.Any()),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(t.Any()),
  }),
});

const CommentaryGradeResponse = t.Object({
  success: t.Boolean(),
  grade: t.Number(),
  message: t.String(),
});

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
    };
  })
  .guard(authGuard, (app) =>
    app
      .use(bearer())
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
              preferred_language: t.Union([t.String(), t.Null()]),
            }),
            response: {
              200: SuccessMessageResponse,
              ...AuthErrors,
              404: ErrorResponse,
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
                200: LanguagesListResponse,
                ...AuthErrors,
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
                200: LanguageStatsResponse,
                ...AuthErrors,
              },
            },
          )
          .get(
            "/users",
            async ({ store: { db } }) => {
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
            },
            {
              response: {
                200: UsersListResponse,
                ...AuthErrors,
              },
            },
          ),
      ),
  )
  .guard(authGuard, (app) => {
    return app
      .use(bearer())
      .resolve({ as: "scoped" }, authDerive)
      .guard(adminGuard)
      .group("/admin", (app) => {
        return app
          .get(
            "/users",
            async ({ store: { db } }) => {
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
            },
            {
              response: {
                200: UsersListResponse,
                ...AuthErrors,
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
                200: SuccessMessageResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                201: BatchOperationResponse,
                ...StandardErrors,
              },
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
                201: BatchOperationResponse,
                ...StandardErrors,
              },
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
                201: BatchOperationResponse,
                ...StandardErrors,
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
                200: BatchStatusResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                200: SuccessMessageResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                200: BatchListResponse,
                ...AuthErrors,
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
                200: BatchChildrenResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                200: MonitorBatchResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                200: MonitorBatchResponse,
                ...AuthErrors,
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
                200: BatchSummaryResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
              response: {
                200: DeleteExplanationResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                201: RegenerateExplanationResponse,
                ...StandardErrors,
                404: ErrorResponse,
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
              response: {
                201: GenerateExplanationResponse,
                ...StandardErrors,
                404: ErrorResponse,
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
              response: {
                200: ExplanationComparisonResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
              body: t.Object({
                chosenExplanationId: t.Number(),
              }),
              response: {
                200: ChooseVersionResponse,
                ...StandardErrors,
                404: ErrorResponse,
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
                200: BulkDeleteResponse,
                ...StandardErrors,
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
                200: SetActiveDefaultResponse,
                ...StandardErrors,
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
                200: SetActiveDefaultResponse,
                ...StandardErrors,
              },
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
              response: {
                200: SetActiveDefaultResponse,
                ...StandardErrors,
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
                200: BulkDeleteResponse,
                ...StandardErrors,
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
              response: {
                200: ExplanationHistoryResponse,
                ...AuthErrors,
                404: ErrorResponse,
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
                200: ExplanationsFilterResponse,
                ...StandardErrors,
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
                200: StatsResponse,
                ...AuthErrors,
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
                    200: SystemPromptsListResponse,
                    ...AuthErrors,
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
                    200: UserPromptsListResponse,
                    ...AuthErrors,
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
                    200: ExplanationTypesResponse,
                    ...AuthErrors,
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
                    201: CreatePromptResponse,
                    ...StandardErrors,
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
                    201: CreatePromptResponse,
                    ...StandardErrors,
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
                    200: UpdatePromptResponse,
                    ...StandardErrors,
                    404: ErrorResponse,
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
                    200: UpdatePromptResponse,
                    ...StandardErrors,
                    404: ErrorResponse,
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
                  response: {
                    200: DeletePromptResponse,
                    ...AuthErrors,
                    404: ErrorResponse,
                  },
                },
              )
              .delete(
                "/user/:id",
                async ({ params, store }) => {
                  const adminPromptService = store.getAdminPromptService();
                  return adminPromptService.deleteUserPrompt(Number(params.id));
                },
                {
                  response: {
                    200: DeletePromptResponse,
                    ...AuthErrors,
                    404: ErrorResponse,
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
                    200: PromptStatusResponse,
                    ...StandardErrors,
                    404: ErrorResponse,
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
                    200: PromptStatusResponse,
                    ...StandardErrors,
                    404: ErrorResponse,
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
                    200: RestoreDefaultsResponse,
                    ...AuthErrors,
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
                    200: PlaygroundResponse,
                    ...StandardErrors,
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
                    200: ExistingExplanationResponse,
                    ...StandardErrors,
                    404: ErrorResponse,
                  },
                },
              ),
          )

          .get(
            "/commentary/grades",
            async ({ store: { db } }) => {
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
                200: CommentaryGradesResponse,
                ...AuthErrors,
              },
            },
          )
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
              response: {
                200: CommentaryGradeResponse,
                ...StandardErrors,
              },
            },
          );
      });
  });

// Export the plugin
export default plugin;
export type AdminPlugin = typeof plugin;

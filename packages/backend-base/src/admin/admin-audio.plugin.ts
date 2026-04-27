import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { Elysia, t } from "elysia";
import { AdminAudioService } from "./services/admin-audio.service";

/**
 * TASK-006: admin audio endpoints. Mounted inside admin.plugin.ts so it
 * inherits the existing auth + adminGuard stack. Routes live under
 * /admin/explanations/audio.
 */

const AdminAudioRowSchema = t.Object({
  audio_id: t.Nullable(t.String()),
  explanation_id: t.Number(),
  chapter_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  explanation_type: t.String(),
  language_code: t.String(),
  voice: t.Nullable(t.String()),
  duration_seconds: t.Nullable(t.Number()),
  generated_at: t.Nullable(t.String()),
  tts_provider: t.Nullable(t.String()),
  tts_model: t.Nullable(t.String()),
  content_hash: t.Nullable(t.String()),
  storage_key: t.Nullable(t.String()),
  status: t.Union([
    t.Literal("current"),
    t.Literal("stale"),
    t.Literal("missing"),
    t.Literal("failed"),
  ]),
});

const AdminAudioListResponse = t.Object({
  rows: t.Array(AdminAudioRowSchema),
  total: t.Number(),
});

const BulkRegenBody = t.Object({
  explanationIds: t.Optional(t.Array(t.Number())),
  filters: t.Optional(
    t.Object({
      bookId: t.Optional(t.Number()),
      chapterNumber: t.Optional(t.Number()),
      type: t.Optional(t.String()),
      versionKey: t.Optional(t.String()),
      languageCode: t.Optional(t.String()),
    }),
  ),
  voice: t.Optional(t.String()),
  language: t.Optional(t.String()),
});

const adminAudioPlugin = new Elysia().group("/explanations/audio", (app) =>
  app
    .resolve(({ store }: any) => ({
      adminAudioService: new AdminAudioService(store.db),
    }))
    .post(
      "/regenerate",
      async ({ body, adminAudioService }: any) => {
        const result = await adminAudioService.bulkRegenerate({
          explanationIds: body.explanationIds,
          filters: body.filters
            ? {
                ...body.filters,
                type: body.filters.type as ExplanationTypeEnum | undefined,
              }
            : undefined,
          voice: body.voice,
          language: body.language,
        });
        return result;
      },
      {
        body: BulkRegenBody,
        response: {
          200: t.Object({
            batch_id: t.String(),
            job_count: t.Number(),
          }),
        },
      },
    )
    .get(
      "/",
      async ({ query, adminAudioService }: any) => {
        return await adminAudioService.listAudios({
          language: query.language,
          voice: query.voice,
          isStale:
            query.isStale === undefined ? undefined : query.isStale === "true",
          chapterId: query.chapterId ? Number(query.chapterId) : undefined,
          type: query.type as ExplanationTypeEnum | undefined,
          versionKey: query.versionKey,
          limit: query.limit ? Number(query.limit) : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        });
      },
      {
        query: t.Object({
          language: t.Optional(t.String()),
          voice: t.Optional(t.String()),
          isStale: t.Optional(t.String()),
          chapterId: t.Optional(t.String()),
          type: t.Optional(t.String()),
          versionKey: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
        }),
        response: {
          200: AdminAudioListResponse,
        },
      },
    )
    .get(
      "/:audioId",
      async ({ params, adminAudioService }: any) => {
        return await adminAudioService.getAudio(params.audioId);
      },
      {
        params: t.Object({ audioId: t.String() }),
        response: {
          200: AdminAudioRowSchema,
        },
      },
    )
    .delete(
      "/:audioId",
      async ({ params, adminAudioService, set }: any) => {
        await adminAudioService.markStale(params.audioId);
        set.status = 204;
        return undefined;
      },
      {
        params: t.Object({ audioId: t.String() }),
        response: {
          204: t.Void(),
        },
      },
    ),
);

export default adminAudioPlugin;

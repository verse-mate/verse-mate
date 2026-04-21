import { Elysia, t } from "elysia";
import { authDerive } from "../../auth/auth.utils";
import { createErrorHandler } from "../../common/error-handler";
import { StandardErrorResponses } from "../../common/response-schemas";
import shared from "../../shared/shared.plugin";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import { AudioProgressService } from "./audio-progress.service";
import {
  AudioJobQueuedSchema,
  AudioJobStatusSchema,
  AudioProgressSaveBodySchema,
  AudioProgressSchema,
  AudioResponseSchema,
} from "./audio.schemas";
import { AudioService } from "./audio.service";

const plugin = new Elysia({ name: "audio" })
  .use(shared)
  .onError(createErrorHandler("audio plugin"))
  .state((state) => ({
    ...state,
    audioService: new AudioService(state.db, new ObjectStorageService()),
    audioProgressService: new AudioProgressService(state.db),
  }))
  .group("/bible/explanation/audio", (app) =>
    app
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/:explanationId",
        async ({
          params,
          query,
          store: { audioService },
          currentUserId,
          set,
        }) => {
          const result = await audioService.getOrQueueAudio({
            explanation_id: params.explanationId,
            voice: query.voice,
            language: query.language,
            currentUserId,
          });

          if (result.kind === "ready") {
            return { audio: result.audio };
          }

          set.status = 202;
          return { job: result.job };
        },
        {
          params: t.Object({ explanationId: t.Numeric() }),
          query: t.Object({
            voice: t.Optional(t.String()),
            language: t.Optional(t.String()),
          }),
          response: {
            200: AudioResponseSchema,
            202: AudioJobQueuedSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/jobs/:jobId",
        async ({ params, store: { audioService } }) => {
          const status = await audioService.getJobStatus(params.jobId);
          return { job: status };
        },
        {
          params: t.Object({ jobId: t.String() }),
          response: {
            200: AudioJobStatusSchema,
            ...StandardErrorResponses,
          },
        },
      )
      // --- TASK-005: resume-progress (br-audio-004) ----------------------
      .get(
        "/:explanationId/progress",
        async ({
          params,
          store: { audioProgressService },
          currentUserId,
          set,
        }) => {
          const progress = await audioProgressService.getPosition(
            currentUserId,
            params.explanationId,
          );
          if (!progress) {
            set.status = 404;
            return {
              error: "NOT_FOUND",
              message: "No resume progress for this explanation",
            };
          }
          return progress;
        },
        {
          params: t.Object({ explanationId: t.Numeric() }),
          response: {
            200: AudioProgressSchema,
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/:explanationId/progress",
        async ({
          params,
          body,
          store: { audioProgressService },
          currentUserId,
          set,
        }) => {
          const result = await audioProgressService.savePosition({
            userId: currentUserId,
            explanationId: params.explanationId,
            positionSeconds: body.position_seconds,
            durationSeconds: body.duration_seconds,
            reason: body.reason,
          });
          if (result.kind === "saved") {
            return {
              position_seconds: Number(result.progress.position_seconds),
              duration_seconds: Number(result.progress.duration_seconds),
              updated_at:
                result.progress.updated_at instanceof Date
                  ? result.progress.updated_at.toISOString()
                  : new Date(result.progress.updated_at).toISOString(),
            };
          }
          // Cleared, skipped-guest, and skipped-below-minimum all map to 204.
          set.status = 204;
          return undefined;
        },
        {
          params: t.Object({ explanationId: t.Numeric() }),
          body: AudioProgressSaveBodySchema,
          response: {
            200: AudioProgressSchema,
            204: t.Void(),
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/:explanationId/progress",
        async ({
          params,
          store: { audioProgressService },
          currentUserId,
          set,
        }) => {
          await audioProgressService.clearPosition(
            currentUserId,
            params.explanationId,
          );
          set.status = 204;
          return undefined;
        },
        {
          params: t.Object({ explanationId: t.Numeric() }),
          response: {
            204: t.Void(),
            ...StandardErrorResponses,
          },
        },
      ),
  );

export default plugin;
export type AudioPlugin = typeof plugin;

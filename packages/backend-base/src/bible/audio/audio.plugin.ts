import { Elysia, t } from "elysia";
import { authDerive } from "../../auth/auth.utils";
import { createErrorHandler } from "../../common/error-handler";
import { StandardErrorResponses } from "../../common/response-schemas";
import shared from "../../shared/shared.plugin";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import {
  AudioJobQueuedSchema,
  AudioJobStatusSchema,
  AudioResponseSchema,
} from "./audio.schemas";
import { AudioService } from "./audio.service";

const plugin = new Elysia({ name: "audio" })
  .use(shared)
  .onError(createErrorHandler("audio plugin"))
  .state((state) => ({
    ...state,
    audioService: new AudioService(state.db, new ObjectStorageService()),
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
      ),
  );

export default plugin;
export type AudioPlugin = typeof plugin;

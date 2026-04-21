import { t } from "elysia";

export const AudioSchema = t.Object({
  audio_id: t.String(),
  url: t.String(),
  duration_seconds: t.Number(),
  character_count: t.Number(),
  voice: t.String(),
  language_code: t.String(),
  is_stale: t.Boolean(),
  generated_at: t.String(),
  tts_provider: t.String(),
  tts_model: t.String(),
  storage_key: t.String(),
});

export const AudioResponseSchema = t.Object({ audio: AudioSchema });

export const AudioJobQueuedSchema = t.Object({
  job: t.Object({
    job_id: t.String(),
    estimated_ready_seconds: t.Number(),
  }),
});

export const AudioJobStatusSchema = t.Object({
  job: t.Object({
    job_id: t.String(),
    status: t.Union([
      t.Literal("queued"),
      t.Literal("active"),
      t.Literal("completed"),
      t.Literal("failed"),
    ]),
    audio: t.Optional(AudioSchema),
    error_code: t.Optional(t.String()),
  }),
});

/**
 * TASK-005 (br-audio-004): progress DTO returned from GET /progress.
 */
export const AudioProgressSchema = t.Object({
  position_seconds: t.Number(),
  duration_seconds: t.Number(),
  updated_at: t.String(),
});

export const AudioProgressSaveBodySchema = t.Object({
  position_seconds: t.Number({ minimum: 0 }),
  duration_seconds: t.Number({ minimum: 0 }),
  reason: t.Union([
    t.Literal("pause"),
    t.Literal("complete"),
    t.Literal("background"),
    t.Literal("navigation"),
  ]),
});

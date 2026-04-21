import { t } from "elysia";

/**
 * Reader-facing audio payload (br-audio-007 stub transparency). Four
 * fields only — no ttsProvider, no storage_key, no content_hash. Admin
 * endpoints use AdminAudioSchema (separate file) when the full shape
 * is needed.
 */
export const AudioSchema = t.Object({
  url: t.String(),
  duration_seconds: t.Number(),
  voice: t.String(),
  language_code: t.String(),
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
 * Stub transparency (br-audio-007): admin surface only. Keep the
 * operational metadata off the reader path.
 */
export const AdminAudioSchema = t.Object({
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

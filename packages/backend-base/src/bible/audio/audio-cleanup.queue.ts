import { Queue } from "bullmq";
import bullmqRedisConnection from "../../shared/bullmq-redis";

export const AUDIO_CLEANUP_QUEUE = "audio-cleanup";
export const AUDIO_CLEANUP_JOB = "audio-cleanup-run";

/**
 * TASK-004 cron default — 03:00 UTC daily. Override via AUDIO_CLEANUP_CRON.
 * Must be a valid BullMQ cron pattern (standard 5-field cron).
 */
export const AUDIO_CLEANUP_DEFAULT_CRON = "0 3 * * *";

/**
 * Rows must be stale for at least this long before the worker may touch
 * them (br-audio-002). 24h provides the buffer for in-flight readers who
 * already have a presigned URL in hand.
 */
export const AUDIO_CLEANUP_MIN_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum rows processed per job run. One stale-and-old feature should
 * not monopolise the worker — subsequent cron ticks drain the backlog.
 */
export const AUDIO_CLEANUP_BATCH_SIZE = 100;

export type AudioCleanupJobData = Record<string, never>;

export const audioCleanupQueue = new Queue<AudioCleanupJobData>(
  AUDIO_CLEANUP_QUEUE,
  { connection: bullmqRedisConnection },
);

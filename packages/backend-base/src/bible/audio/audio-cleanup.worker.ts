import { Worker } from "bullmq";
import { db as Database } from "database";
import bullmqRedisConnection from "../../shared/bullmq-redis";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import {
  AUDIO_CLEANUP_DEFAULT_CRON,
  AUDIO_CLEANUP_JOB,
  AUDIO_CLEANUP_QUEUE,
  type AudioCleanupJobData,
  audioCleanupQueue,
} from "./audio-cleanup.queue";
import {
  type AudioCleanupResult,
  AudioCleanupService,
} from "./audio-cleanup.service";

export const audioCleanupWorker = new Worker<
  AudioCleanupJobData,
  AudioCleanupResult
>(
  AUDIO_CLEANUP_QUEUE,
  async (_job) => {
    const service = new AudioCleanupService(
      Database,
      new ObjectStorageService(),
      {
        info: (msg, meta) => console.log(msg, meta ?? ""),
        error: (msg, meta) => console.error(msg, meta ?? ""),
      },
    );
    return service.runCleanup();
  },
  {
    connection: bullmqRedisConnection,
    concurrency: 1,
    autorun: false,
  },
);

audioCleanupWorker.on("completed", (job) => {
  console.log(
    `[AUDIO-CLEANUP] job ${job?.id} done: scanned=${job?.returnvalue?.scanned_count} deleted=${job?.returnvalue?.deleted_count} failed=${job?.returnvalue?.failed_count} ${job?.returnvalue?.duration_ms}ms`,
  );
});

audioCleanupWorker.on("failed", (job, err) => {
  console.error(`[AUDIO-CLEANUP] job ${job?.id} failed: ${err.message}`);
});

/**
 * Registers the repeatable cleanup job. Safe to call multiple times —
 * BullMQ uses the repeatable key (pattern) as the idempotency anchor.
 * Invoked from shared.plugin.onStart so the cron only runs while a
 * server is up.
 */
export async function registerAudioCleanupCron(): Promise<void> {
  const pattern = process.env.AUDIO_CLEANUP_CRON ?? AUDIO_CLEANUP_DEFAULT_CRON;
  await audioCleanupQueue.add(
    AUDIO_CLEANUP_JOB,
    {},
    {
      repeat: { pattern },
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(`[AUDIO-CLEANUP] repeatable job registered (cron: ${pattern})`);
}

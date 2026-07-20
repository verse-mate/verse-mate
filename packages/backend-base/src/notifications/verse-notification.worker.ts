import { Worker } from "bullmq";
import { db as Database } from "database";
import bullmqRedisConnection from "../shared/bullmq-redis";
import {
  type DailySendResult,
  NotificationsService,
} from "./services/notifications.service";
import {
  VERSE_NOTIFICATION_DEFAULT_CRON,
  VERSE_NOTIFICATION_JOB,
  VERSE_NOTIFICATION_QUEUE,
  type VerseNotificationJobData,
  verseNotificationQueue,
} from "./verse-notification.queue";

export const verseNotificationWorker = new Worker<
  VerseNotificationJobData,
  DailySendResult
>(
  VERSE_NOTIFICATION_QUEUE,
  async (_job) => {
    const service = new NotificationsService(Database, {
      logger: {
        info: (msg, meta) => console.log(msg, meta ?? ""),
        error: (msg, meta) => console.error(msg, meta ?? ""),
      },
    });
    return service.sendDailyVerse();
  },
  {
    connection: bullmqRedisConnection,
    concurrency: 1,
    autorun: false,
  },
);

verseNotificationWorker.on("completed", (job) => {
  const r = job?.returnvalue;
  console.log(
    `[VERSE-NOTIFICATION] job ${job?.id} done: scanned=${r?.scanned} sent=${r?.sent} skippedEmpty=${r?.skippedEmpty} failed=${r?.failed} pruned=${r?.pruned}`,
  );
});

verseNotificationWorker.on("failed", (job, err) => {
  console.error(`[VERSE-NOTIFICATION] job ${job?.id} failed: ${err.message}`);
});

/**
 * Registers the repeatable daily-verse notification job. Safe to call every
 * boot — BullMQ uses the repeat pattern as the idempotency key. Invoked from
 * shared.plugin.onStart so the cron only runs while a server is up.
 */
export async function registerVerseNotificationCron(): Promise<void> {
  const pattern =
    process.env.VERSE_NOTIFICATION_CRON ?? VERSE_NOTIFICATION_DEFAULT_CRON;
  await verseNotificationQueue.add(
    VERSE_NOTIFICATION_JOB,
    {},
    {
      repeat: { pattern },
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(
    `[VERSE-NOTIFICATION] repeatable job registered (cron: ${pattern})`,
  );
}

import { Worker } from "bullmq";
import { db as Database } from "database";
import bullmqRedisConnection from "../../shared/bullmq-redis";
import { BibleSearchRepository } from "./bible-search.repository";
import {
  VERSE_POPULARITY_DEFAULT_CRON,
  VERSE_POPULARITY_JOB,
  VERSE_POPULARITY_QUEUE,
  type VersePopularityJobData,
  versePopularityQueue,
} from "./verse-popularity.queue";

/** Refreshes the verse_popularity view the Bible search ranks by. */
export const versePopularityWorker = new Worker<VersePopularityJobData>(
  VERSE_POPULARITY_QUEUE,
  async () => {
    await new BibleSearchRepository(Database).refreshPopularity();
  },
  {
    connection: bullmqRedisConnection,
    concurrency: 1,
    autorun: false,
  },
);

versePopularityWorker.on("failed", (job, err) => {
  console.error(`[VERSE-POPULARITY] job ${job?.id} failed: ${err.message}`);
});

/**
 * Registers the repeatable refresh. Safe to call multiple times — BullMQ
 * uses the repeatable key (pattern) as the idempotency anchor.
 */
export async function registerVersePopularityCron(): Promise<void> {
  const pattern =
    process.env.VERSE_POPULARITY_CRON ?? VERSE_POPULARITY_DEFAULT_CRON;
  await versePopularityQueue.add(
    VERSE_POPULARITY_JOB,
    {},
    {
      repeat: { pattern },
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(
    `[VERSE-POPULARITY] repeatable job registered (cron: ${pattern})`,
  );
}

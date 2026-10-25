import { Queue } from "bullmq";
import bullmqRedisConnection from "../../shared/bullmq-redis";

export const VERSE_POPULARITY_QUEUE = "verse-popularity";
export const VERSE_POPULARITY_JOB = "verse-popularity-refresh";

/**
 * Hourly. Override via VERSE_POPULARITY_CRON (standard 5-field cron).
 * The refresh reads a few thousand highlight rows and takes well under a
 * second, so hourly keeps new highlights and daily verses in the ranking
 * without a measurable cost.
 */
export const VERSE_POPULARITY_DEFAULT_CRON = "17 * * * *";

export type VersePopularityJobData = Record<string, never>;

export const versePopularityQueue = new Queue<VersePopularityJobData>(
  VERSE_POPULARITY_QUEUE,
  { connection: bullmqRedisConnection },
);

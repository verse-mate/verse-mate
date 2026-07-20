import { Queue } from "bullmq";
import bullmqRedisConnection from "../shared/bullmq-redis";

export const VERSE_NOTIFICATION_QUEUE = "verse-notification";
export const VERSE_NOTIFICATION_JOB = "verse-notification-run";

/**
 * Daily cron default — 12:00 UTC (D-4). Morning across the Americas (the
 * default English/NASB1995 audience), daytime in Europe/Africa. Override via
 * VERSE_NOTIFICATION_CRON; tune from verse-mate-analytics peak-usage data.
 * Single global tick for v1 (no per-user timezone — documented limitation).
 */
export const VERSE_NOTIFICATION_DEFAULT_CRON = "0 12 * * *";

export type VerseNotificationJobData = Record<string, never>;

export const verseNotificationQueue = new Queue<VerseNotificationJobData>(
  VERSE_NOTIFICATION_QUEUE,
  { connection: bullmqRedisConnection },
);

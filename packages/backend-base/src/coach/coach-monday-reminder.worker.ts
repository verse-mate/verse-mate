import { Queue, Worker } from "bullmq";
import { db as Database } from "database";

import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import bullmqRedisConnection from "../shared/bullmq-redis";
import {
  CoachMondayReminderService,
  type MondayReminderResult,
  coachMondayRepeat,
} from "./coach-monday-reminder.service";

export const COACH_MONDAY_REMINDER_QUEUE = "coach-monday-reminder";
export const COACH_MONDAY_REMINDER_JOB = "coach-monday-reminder-run";

export const coachMondayReminderQueue = new Queue<Record<string, never>>(
  COACH_MONDAY_REMINDER_QUEUE,
  { connection: bullmqRedisConnection },
);

export const coachMondayReminderWorker = new Worker<
  Record<string, never>,
  MondayReminderResult
>(
  COACH_MONDAY_REMINDER_QUEUE,
  () =>
    new CoachMondayReminderService(
      Database,
      new EmailNotificationConsumer(),
    ).run(),
  { connection: bullmqRedisConnection, concurrency: 1, autorun: false },
);

coachMondayReminderWorker.on("completed", (job) => {
  const r = job?.returnvalue;
  console.log(
    `[COACH-MONDAY] job ${job?.id} ${r?.date}: ${r?.skipped ?? "ran"} sent=${r?.sent} failed=${r?.failed}`,
  );
});

coachMondayReminderWorker.on("failed", (job, err) => {
  console.error(`[COACH-MONDAY] job ${job?.id} failed:`, err);
});

export async function registerCoachMondayReminderCron(): Promise<void> {
  const repeat = coachMondayRepeat();
  await coachMondayReminderQueue.add(
    COACH_MONDAY_REMINDER_JOB,
    {},
    {
      repeat,
      attempts: 3,
      backoff: { type: "exponential", delay: 600_000 },
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(
    `[COACH-MONDAY] repeatable job registered (cron: ${repeat.pattern} ${repeat.tz})`,
  );
}

import { Worker } from "bullmq";
import { db as Database } from "database";

import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import bullmqRedisConnection from "../shared/bullmq-redis";
import {
  COACH_REMINDER_DEFAULT_CRON,
  COACH_REMINDER_JOB,
  COACH_REMINDER_QUEUE,
  COACH_REMINDER_TIME_ZONE,
  type CoachReminderJobData,
  coachReminderQueue,
} from "./coach-reminder.queue";
import {
  CoachReminderService,
  type ReminderRunResult,
} from "./coach-reminder.service";

export function runCoachReminderTick(): Promise<ReminderRunResult> {
  return new CoachReminderService(
    Database,
    new EmailNotificationConsumer(),
  ).run();
}

export const COACH_REMINDER_WORKER_OPTIONS = {
  concurrency: 1,
  autorun: false,
} as const;

export const coachReminderWorker = new Worker<
  CoachReminderJobData,
  ReminderRunResult
>(COACH_REMINDER_QUEUE, runCoachReminderTick, {
  connection: bullmqRedisConnection,
  ...COACH_REMINDER_WORKER_OPTIONS,
});

coachReminderWorker.on("completed", (job) => {
  const r = job?.returnvalue;
  console.log(
    `[COACH-REMINDER] job ${job?.id} ${r?.date}: ${r?.skipped ?? "ran"} sent=${r?.sent.length} failed=${r?.failed.length} notReminded=${r?.notReminded.length} summary=${r?.summarySent}`,
  );
});

coachReminderWorker.on("failed", (job, err) => {
  console.error(`[COACH-REMINDER] job ${job?.id} failed:`, err);
});

export function coachReminderRepeat() {
  return {
    pattern: process.env.COACH_REMINDER_CRON ?? COACH_REMINDER_DEFAULT_CRON,
    tz: COACH_REMINDER_TIME_ZONE,
  };
}

export async function registerCoachReminderCron(): Promise<void> {
  const repeat = coachReminderRepeat();
  await coachReminderQueue.add(
    COACH_REMINDER_JOB,
    {},
    {
      repeat,
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(
    `[COACH-REMINDER] repeatable job registered (cron: ${repeat.pattern} ${repeat.tz})`,
  );
}

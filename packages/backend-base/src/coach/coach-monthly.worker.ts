import { Worker } from "bullmq";
import { db as Database } from "database";

import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import { getAiProvider } from "../shared/ai";
import bullmqRedisConnection from "../shared/bullmq-redis";
import {
  COACH_MONTHLY_DEFAULT_CRON,
  COACH_MONTHLY_JOB,
  COACH_MONTHLY_QUEUE,
  COACH_MONTHLY_TIME_ZONE,
  type CoachMonthlyJobData,
  coachMonthlyQueue,
} from "./coach-monthly.queue";
import { CoachMonthlyService } from "./coach-monthly.service";
import { calendarDate } from "./coach-reminder.service";

export function monthJustEnded(now: Date): string {
  const [year, month] = calendarDate(now).split("-").map(Number);
  const ended = new Date(Date.UTC(year, month - 2, 1));
  return `${ended.getUTCFullYear()}-${String(ended.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function runCoachMonthlyTick(now = new Date()) {
  return new CoachMonthlyService(
    Database,
    () => getAiProvider(),
    new EmailNotificationConsumer(),
  ).produce(monthJustEnded(now));
}

export const COACH_MONTHLY_WORKER_OPTIONS = {
  concurrency: 1,
  autorun: false,
} as const;

export const coachMonthlyWorker = new Worker<
  CoachMonthlyJobData,
  { produced: number }
>(COACH_MONTHLY_QUEUE, () => runCoachMonthlyTick(), {
  connection: bullmqRedisConnection,
  ...COACH_MONTHLY_WORKER_OPTIONS,
});

coachMonthlyWorker.on("completed", (job) => {
  console.log(
    `[COACH-MONTHLY] job ${job?.id} produced=${job?.returnvalue?.produced}`,
  );
});

coachMonthlyWorker.on("failed", (job, err) => {
  console.error(`[COACH-MONTHLY] job ${job?.id} failed:`, err);
});

export function coachMonthlyRepeat() {
  return {
    pattern: process.env.COACH_MONTHLY_CRON ?? COACH_MONTHLY_DEFAULT_CRON,
    tz: COACH_MONTHLY_TIME_ZONE,
  };
}

export async function registerCoachMonthlyCron(): Promise<void> {
  const repeat = coachMonthlyRepeat();
  await coachMonthlyQueue.add(
    COACH_MONTHLY_JOB,
    {},
    { repeat, removeOnComplete: { count: 12 }, removeOnFail: 24 },
  );
  console.log(
    `[COACH-MONTHLY] repeatable job registered (cron: ${repeat.pattern} ${repeat.tz})`,
  );
}

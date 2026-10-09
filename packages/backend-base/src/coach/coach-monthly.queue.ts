import { Queue } from "bullmq";

import bullmqRedisConnection from "../shared/bullmq-redis";
import { REMINDER_TIME_ZONE } from "./coach-reminder.service";

export const COACH_MONTHLY_QUEUE = "coach-monthly";
export const COACH_MONTHLY_JOB = "coach-monthly-run";
export const COACH_MONTHLY_DEFAULT_CRON = "0 9 1 * *";
export const COACH_MONTHLY_TIME_ZONE = REMINDER_TIME_ZONE;

export type CoachMonthlyJobData = Record<string, never>;

export const coachMonthlyQueue = new Queue<CoachMonthlyJobData>(
  COACH_MONTHLY_QUEUE,
  { connection: bullmqRedisConnection },
);

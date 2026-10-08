import { Queue } from "bullmq";

import bullmqRedisConnection from "../shared/bullmq-redis";
import { REMINDER_TIME_ZONE } from "./coach-reminder.service";

export const COACH_REMINDER_QUEUE = "coach-reminder";
export const COACH_REMINDER_JOB = "coach-reminder-run";
export const COACH_REMINDER_DEFAULT_CRON = "0 18 * * *";
export const COACH_REMINDER_TIME_ZONE = REMINDER_TIME_ZONE;

export type CoachReminderJobData = Record<string, never>;

export const coachReminderQueue = new Queue<CoachReminderJobData>(
  COACH_REMINDER_QUEUE,
  { connection: bullmqRedisConnection },
);

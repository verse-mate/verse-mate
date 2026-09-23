import { Queue } from "bullmq";

import bullmqRedisConnection from "../shared/bullmq-redis";

export const COACH_INTAKE_QUEUE = "coach-intake";
export const COACH_INTAKE_JOB = "coach-intake-run";

/**
 * Every 30 minutes, matching the cadence of the systemd timer this replaces on
 * the retired host. The recording bot publishes a transcript some minutes after
 * a session ends, and a leader waiting on a report notices hours, not minutes —
 * so polling harder buys nothing and costs provider quota.
 *
 * Override with COACH_INTAKE_CRON.
 */
export const COACH_INTAKE_DEFAULT_CRON = "*/30 * * * *";

export type CoachIntakeJobData = Record<string, never>;

export const coachIntakeQueue = new Queue<CoachIntakeJobData>(
  COACH_INTAKE_QUEUE,
  { connection: bullmqRedisConnection },
);

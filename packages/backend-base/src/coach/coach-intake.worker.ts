import { Worker } from "bullmq";
import { db as Database } from "database";

import bullmqRedisConnection from "../shared/bullmq-redis";
import { CoachArchiveService } from "./coach-archive.service";
import {
  COACH_INTAKE_DEFAULT_CRON,
  COACH_INTAKE_JOB,
  COACH_INTAKE_QUEUE,
  type CoachIntakeJobData,
  coachIntakeQueue,
} from "./coach-intake.queue";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachRetrievalService } from "./coach-retrieval.service";
import { HttpFirefliesClient } from "./fireflies.client";
import { firefliesConfigured } from "./fireflies.config";

/**
 * The coaching pipeline's clock (change: port-coach-pipeline, task 4.3).
 *
 * This replaces the 30-minute systemd timer on the retired host, and it is the
 * whole point of the port: after it, **no step depends on a machine outside
 * VerseMate**, and nothing in the pipeline holds a credential that can write to
 * production source control. The old host had both — it pushed a rebuilt
 * `coach.data.json` to `verse-mate`'s default branch on a timer.
 *
 * Two phases per tick, in order: observe new sessions, then work the retrieval
 * backlog. Retrieval second so a session seen this tick can have its material
 * fetched in the same run rather than waiting another thirty minutes.
 */

export interface CoachIntakeRunResult {
  skipped?: "no-credential";
  observed: number;
  alreadySeen: number;
  unresolved: number;
  retrievalAttempted: number;
  retained: number;
  held: number;
  retrievalFailed: number;
}

export const coachIntakeWorker = new Worker<
  CoachIntakeJobData,
  CoachIntakeRunResult
>(
  COACH_INTAKE_QUEUE,
  async (): Promise<CoachIntakeRunResult> => {
    // Refuse rather than degrade. Without the credential every tick would poll
    // nothing and report success, which is indistinguishable from a quiet week
    // — and the quiet week is the one that is fine.
    if (!firefliesConfigured()) {
      console.error(
        "[COACH-INTAKE] FIREFLIES_API_KEY is not set; intake cannot run",
      );
      return {
        skipped: "no-credential",
        observed: 0,
        alreadySeen: 0,
        unresolved: 0,
        retrievalAttempted: 0,
        retained: 0,
        held: 0,
        retrievalFailed: 0,
      };
    }

    const client = new HttpFirefliesClient();
    const poll = await new CoachIntakeService(Database, client).poll();
    const sweep = await new CoachRetrievalService(
      Database,
      new CoachArchiveService(Database, client),
    ).sweep();

    return {
      observed: poll.observed,
      alreadySeen: poll.alreadySeen,
      unresolved: poll.unresolved,
      retrievalAttempted: sweep.attempted,
      retained: sweep.retained,
      held: sweep.held,
      retrievalFailed: sweep.failed,
    };
  },
  {
    connection: bullmqRedisConnection,
    // One at a time: two concurrent ticks would poll the same window and race
    // on the same sessions. The dedupe would hold, but the provider quota
    // would be spent twice for nothing.
    concurrency: 1,
    autorun: false,
  },
);

coachIntakeWorker.on("completed", (job) => {
  const r = job?.returnvalue;
  if (r?.skipped) {
    console.error(`[COACH-INTAKE] job ${job?.id} skipped: ${r.skipped}`);
    return;
  }
  console.log(
    `[COACH-INTAKE] job ${job?.id} done: observed=${r?.observed} ` +
      `alreadySeen=${r?.alreadySeen} unresolved=${r?.unresolved} ` +
      `retained=${r?.retained} held=${r?.held} failed=${r?.retrievalFailed}`,
  );
});

coachIntakeWorker.on("failed", (job, err) => {
  console.error(`[COACH-INTAKE] job ${job?.id} failed:`, err);
});

export async function registerCoachIntakeCron(): Promise<void> {
  const pattern = process.env.COACH_INTAKE_CRON ?? COACH_INTAKE_DEFAULT_CRON;
  await coachIntakeQueue.add(
    COACH_INTAKE_JOB,
    {},
    {
      repeat: { pattern },
      removeOnComplete: { count: 20 },
      removeOnFail: 50,
    },
  );
  console.log(`[COACH-INTAKE] repeatable job registered (cron: ${pattern})`);
}

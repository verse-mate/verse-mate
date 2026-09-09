import { Worker } from "bullmq";
import { db as Database } from "database";

import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
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
import {
  CoachPipelineService,
  type PipelineResult,
} from "./coach-pipeline.service";
import { CoachRetentionService } from "./coach-retention.service";
import { CoachRetrievalService } from "./coach-retrieval.service";
import { HttpFirefliesClient } from "./fireflies.client";
import { firefliesConfigured } from "./fireflies.config";

/**
 * The coaching pipeline's clock (change: port-coach-pipeline, task 4.3).
 *
 * This replaces the 30-minute systemd timer on the retired host, and it is the
 * whole point of the port: after it, **no step depends on a machine outside
 * VerseMate**, and nothing in the pipeline holds a credential that can write to
 * production source control. The old host had both, it pushed a rebuilt
 * `coach.data.json` to `verse-mate`'s default branch on a timer.
 *
 * Four phases per tick, in order, each feeding the next so a session observed
 * this tick can reach a delivered report in the same run rather than waiting
 * thirty minutes per stage:
 *
 *   1. observe new sessions          (CoachIntakeService)
 *   2. retrieve and retain material  (CoachRetrievalService -> CoachArchiveService)
 *   3. score, publish, deliver       (CoachPipelineService)
 *   4. prune what retention bounds   (CoachRetentionService)
 *
 * Phase 3 is why this comment changed. It did not exist: the worker ran phases
 * 1 and 2 and stopped, so scoring, publishing, delivery and frame extraction
 * were unreachable code and recordings were retrieved, stored and paid for
 * without a report ever being produced.
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
  /** Phase 3: sessions carried through to a report. */
  delivered: number;
  awaitingReview: number;
  pipelineFailed: number;
  /** Phase 4: recordings pruned past the per-leader bound. */
  pruned: number;
}

/**
 * One tick, as a plain function.
 *
 * Exported so a test can RUN it. It used to be an anonymous argument to the
 * Worker constructor, which is why the tests that covered it read this file as
 * text and matched regexes against it: they asserted that the source contains
 * `firefliesConfigured()`, not that a missing credential actually skips.
 */
export async function runCoachIntakeTick(): Promise<CoachIntakeRunResult> {
  // Refuse rather than degrade. Without the credential every tick would poll
  // nothing and report success, which is indistinguishable from a quiet week
  //, and the quiet week is the one that is fine.
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
      delivered: 0,
      awaitingReview: 0,
      pipelineFailed: 0,
      pruned: 0,
    };
  }

  const client = new HttpFirefliesClient();
  const poll = await new CoachIntakeService(Database, client).poll();
  const sweep = await new CoachRetrievalService(
    Database,
    new CoachArchiveService(Database, client),
  ).sweep();

  // Phase 3: score, publish, deliver. Each phase is independently guarded so
  // a failure in one does not silently stop the others, the sweep halting
  // the whole tick was the shape of an earlier bug.
  let pipeline: PipelineResult[] = [];
  try {
    pipeline = await new CoachPipelineService(
      Database,
      client,
      new EmailNotificationConsumer(),
    ).run();
  } catch (error) {
    console.error("[COACH-INTAKE] pipeline phase failed:", error);
  }

  // Phase 4: bounded retention. Runs after publishing so a report produced
  // this tick counts toward its leader's four.
  let pruned = 0;
  try {
    pruned = (await new CoachRetentionService(Database).prune()).deleted;
  } catch (error) {
    console.error("[COACH-INTAKE] retention phase failed:", error);
  }

  return {
    observed: poll.observed,
    alreadySeen: poll.alreadySeen,
    unresolved: poll.unresolved,
    retrievalAttempted: sweep.attempted,
    retained: sweep.retained,
    held: sweep.held,
    retrievalFailed: sweep.failed,
    delivered: pipeline.filter((p) => p.outcome === "scored-and-delivered")
      .length,
    awaitingReview: pipeline.filter(
      (p) => p.outcome === "scored-awaiting-review",
    ).length,
    pipelineFailed: pipeline.filter((p) =>
      ["scoring-failed", "delivery-blocked", "delivery-failed"].includes(
        p.outcome,
      ),
    ).length,
    pruned,
  };
}

/**
 * Worker options, exported so the test asserts the VALUES rather than matching
 * a regex against this file's text.
 */
export const COACH_INTAKE_WORKER_OPTIONS = {
  // One at a time: two concurrent ticks would poll the same window and race on
  // the same sessions. The dedupe would hold, but the provider quota would be
  // spent twice for nothing.
  concurrency: 1,
  // The plugin starts it, the way every other worker here is started.
  autorun: false,
} as const;

export const coachIntakeWorker = new Worker<
  CoachIntakeJobData,
  CoachIntakeRunResult
>(COACH_INTAKE_QUEUE, runCoachIntakeTick, {
  connection: bullmqRedisConnection,
  ...COACH_INTAKE_WORKER_OPTIONS,
});

coachIntakeWorker.on("completed", (job) => {
  const r = job?.returnvalue;
  if (r?.skipped) {
    console.error(`[COACH-INTAKE] job ${job?.id} skipped: ${r.skipped}`);
    return;
  }
  console.log(
    `[COACH-INTAKE] job ${job?.id} done: observed=${r?.observed} ` +
      `alreadySeen=${r?.alreadySeen} unresolved=${r?.unresolved} ` +
      `retained=${r?.retained} held=${r?.held} failed=${r?.retrievalFailed} ` +
      `delivered=${r?.delivered} awaitingReview=${r?.awaitingReview} ` +
      `pipelineFailed=${r?.pipelineFailed} pruned=${r?.pruned}`,
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

import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { ApiError } from "../common/errors";

import { answerError, isRouteNotFound } from "../common/error-handler";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import { batchMonitoringWorker } from "../queue/queue";
import bullmqRedisConnection from "./bullmq-redis";
import { type Logger, PosthogService } from "./posthog.service";
import redisClient from "./redis-client";
import { signingSecret } from "./signing-secret";

export type cache = typeof redisClient;

export type db = typeof Database;

const jwt = ElysiaJwt({
  name: "jwt",
  secret: signingSecret(),
  // Per spec feat-auth-platform br-auth-001 (D-005): access token IS the
  // persistent session token; refresh tokens eliminated. Backend Redis cache
  // validates every token so server-side logout immediately revokes regardless
  // of JWT expiry. 90-day TTL matches what the prior refresh-token lifespan
  // enabled, while keeping single-token simplicity.
  exp: "90d",
});

export type JWT = (typeof jwt)["decorator"]["jwt"];

// Simple console-based logger that matches the Logger interface
const logger: Logger = {
  child: ({ component }: { component: string }) => ({
    ...logger,
    warn: (message: string, ...args: unknown[]) =>
      console.warn(`[${component}]`, message, ...args),
    error: (error: unknown) => console.error(`[${component}]`, error),
  }),
  warn: (message: string, ...args: unknown[]) =>
    console.warn("[Logger]", message, ...args),
  error: (error: unknown) => console.error("[Logger]", error),
};

// Initialize PostHog service
const posthogService = new PosthogService({ logger });

/**
 * Helper to extract user ID from bearer token without requiring auth guard
 * Used in global error handler to add user context to exceptions
 */
async function maybeCurrentUserId({
  bearer: token,
  jwt: jwtVerifier,
}: {
  bearer: string | undefined;
  jwt: JWT;
}): Promise<string | null> {
  if (!token) return null;

  try {
    const payload = await jwtVerifier.verify(token);
    if (!payload || typeof payload !== "object" || !payload.sub) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

// const storage = new ObjectStorageService();

const answeredErrors = new Elysia({ name: "answered-errors" }).onError(
  { as: "global" },
  ({ code, error, path, set }) => answerError(path, code, error, set),
);

const BEARER_PREFIX = "Bearer ";

const setup = new Elysia({ name: "shared" })
  .derive({ as: "global" }, ({ headers: { authorization } }) => ({
    bearer: authorization?.startsWith(BEARER_PREFIX)
      ? authorization.slice(BEARER_PREFIX.length)
      : undefined,
  }))
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer())
  .state("batchMonitoringQueue", batchMonitoringQueue)
  .decorate("posthog", posthogService)
  .onError(
    { as: "global" },
    async ({ bearer: bearerToken, jwt: jwtVerifier, error, code, path }) => {
      if (
        code === "NOT_FOUND" &&
        (error instanceof ApiError || isRouteNotFound(error))
      )
        return;
      if (
        !(error instanceof Error) &&
        (error as { status?: unknown }).status === 429
      )
        return;
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      )
        return;

      const distinctId = await maybeCurrentUserId({
        bearer: bearerToken,
        jwt: jwtVerifier,
      });
      const reported =
        code === "VALIDATION"
          ? new Error(
              `validation failed on ${error.type} ${error.valueError?.path ?? ""}`.trim(),
            )
          : error;
      posthogService.captureException(reported, distinctId ?? "anonymous", {
        code,
        $current_url: path,
      });
    },
  )
  .use(answeredErrors as unknown as Elysia);

import { audioCleanupQueue } from "../bible/audio/audio-cleanup.queue";
import {
  audioCleanupWorker,
  registerAudioCleanupCron,
} from "../bible/audio/audio-cleanup.worker";
import { audioGenerationQueue } from "../bible/audio/audio-generation.queue";
import { audioGenerationWorker } from "../bible/audio/audio-generation.worker";
import { coachIntakeQueue } from "../coach/coach-intake.queue";
import {
  coachIntakeWorker,
  registerCoachIntakeCron,
} from "../coach/coach-intake.worker";
import {
  coachMondayReminderQueue,
  coachMondayReminderWorker,
  registerCoachMondayReminderCron,
} from "../coach/coach-monday-reminder.worker";
import { coachMonthlyQueue } from "../coach/coach-monthly.queue";
import {
  coachMonthlyWorker,
  registerCoachMonthlyCron,
} from "../coach/coach-monthly.worker";
import { coachReminderQueue } from "../coach/coach-reminder.queue";
import {
  coachReminderWorker,
  registerCoachReminderCron,
} from "../coach/coach-reminder.worker";
import { verseNotificationQueue } from "../notifications/verse-notification.queue";
import {
  registerVerseNotificationCron,
  verseNotificationWorker,
} from "../notifications/verse-notification.worker";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { batchProcessingWorker } from "../workers/batch-processing.worker";
import { imageMigrator, waitForMigrations } from "./migration-wait";
import { type WorkerRole, runsWorkers, workerRole } from "./worker-role";

export interface QueueWorkerEntry {
  name: string;
  worker: { isRunning(): boolean; run(): unknown };
  registerCron?: () => Promise<unknown>;
}

export const QUEUE_WORKERS: QueueWorkerEntry[] = [
  { name: "Monitoring", worker: batchMonitoringWorker },
  { name: "Processing", worker: batchProcessingWorker },
  { name: "Audio generation", worker: audioGenerationWorker },
  {
    name: "Audio cleanup",
    worker: audioCleanupWorker,
    registerCron: registerAudioCleanupCron,
  },
  {
    name: "Verse notification",
    worker: verseNotificationWorker,
    registerCron: registerVerseNotificationCron,
  },
  {
    name: "Coach intake",
    worker: coachIntakeWorker,
    registerCron: registerCoachIntakeCron,
  },
  {
    name: "Coach reminder",
    worker: coachReminderWorker,
    registerCron: registerCoachReminderCron,
  },
  {
    name: "Coach monthly",
    worker: coachMonthlyWorker,
    registerCron: registerCoachMonthlyCron,
  },
  {
    name: "Coach Monday reminder",
    worker: coachMondayReminderWorker,
    registerCron: registerCoachMondayReminderCron,
  },
];

export async function startQueueWorkers(
  entries: QueueWorkerEntry[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.worker.isRunning()) {
      console.log(`[QUEUE] ${entry.name} worker already running`);
    } else {
      entry.worker.run();
      console.log(`[QUEUE] ${entry.name} worker started successfully`);
    }
    if (!entry.registerCron) continue;
    try {
      await entry.registerCron();
    } catch (error) {
      console.error(`[QUEUE] Failed to register ${entry.name} cron:`, error);
    }
  }
}

export interface BackgroundSteps {
  waitForMigrations(): Promise<void>;
  startWorkers(): Promise<void>;
  resumeBatchMonitoring(): Promise<void>;
}

export async function startBackgroundWork(
  role: WorkerRole,
  steps: BackgroundSteps,
): Promise<void> {
  if (!runsWorkers(role)) {
    console.log(`[QUEUE] No BullMQ workers in this process (role: ${role})`);
    return;
  }
  if (role === "worker") await steps.waitForMigrations();
  console.log(`[QUEUE] Starting BullMQ workers (role: ${role})...`);
  await steps.startWorkers();
  await steps.resumeBatchMonitoring();
}

export async function resumeActiveBatchMonitoring(): Promise<void> {
  console.log("[QUEUE] Checking for existing active batches to monitor...");
  try {
    const activeBatches = await Database.getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("status", "not in", [
        "completed",
        "failed",
        "cancelled",
        "expired",
        "partial_failure",
      ])
      .select(["openai_batch_id", "model"])
      .execute();

    if (activeBatches.length > 0) {
      console.log(
        `[QUEUE] Found ${activeBatches.length} active batches, starting monitoring...`,
      );

      for (const batch of activeBatches) {
        if (batch.openai_batch_id) {
          console.log(
            `[QUEUE] Queuing monitoring for batch ${batch.openai_batch_id}`,
          );
          await batchMonitoringQueue.add(
            "batch-monitoring",
            { batchId: batch.openai_batch_id, model: batch.model },
            {
              jobId: `${batch.openai_batch_id}-startup-${Date.now()}`,
              delay: 10000,
              removeOnComplete: true,
              removeOnFail: 100,
            },
          );
        }
      }

      console.log(
        `[QUEUE] Successfully queued monitoring for ${activeBatches.length} active batches`,
      );
    } else {
      console.log("[QUEUE] No active batches found to monitor");
    }
  } catch (error) {
    console.error("[QUEUE] Error checking for active batches:", error);
  }
}

setup.onStart(() => {
  startBackgroundWork(workerRole(), {
    waitForMigrations: () =>
      waitForMigrations(imageMigrator(Database.getOrCreateConnection())),
    startWorkers: () => startQueueWorkers(QUEUE_WORKERS),
    resumeBatchMonitoring: resumeActiveBatchMonitoring,
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

setup.onStop(async () => {
  console.log("onStop on shared plugin");
  await posthogService.disconnect();
  Database.closeConnection();
  redisClient.disconnect();
  bullmqRedisConnection.disconnect();
  batchMonitoringQueue.close();
  batchMonitoringWorker.close();
  batchProcessingQueue.close();
  batchProcessingWorker.close();
  audioGenerationQueue.close();
  audioGenerationWorker.close();
  audioCleanupQueue.close();
  audioCleanupWorker.close();
  verseNotificationQueue.close();
  verseNotificationWorker.close();
  coachIntakeQueue.close();
  coachIntakeWorker.close();
  coachReminderQueue.close();
  coachReminderWorker.close();
  coachMonthlyQueue.close();
  coachMonthlyWorker.close();
  coachMondayReminderQueue.close();
  coachMondayReminderWorker.close();
});

export default setup;

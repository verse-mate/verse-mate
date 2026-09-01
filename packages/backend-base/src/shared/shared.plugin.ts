import { bearer } from "@elysiajs/bearer";
import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { UserService } from "../user/user.service";

import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import { batchMonitoringWorker } from "../queue/queue";
import bullmqRedisConnection from "./bullmq-redis";
import { type Logger, PosthogService } from "./posthog.service";
import redisClient from "./redis-client";

export type cache = typeof redisClient;

export type db = typeof Database;

// Security (audit #2): never sign sessions with a hardcoded or publicly-known
// secret — either lets any attacker forge a valid JWT for any user. Fail closed
// at startup when the secret is unset OR still the historical default that was
// shipped in .env.example on a public repo (so setting it to that known value
// does not sneak past this guard).
const authTokenSecret = process.env.AUTH_ACCESS_TOKEN_SECRET;
if (!authTokenSecret || authTokenSecret === "my-super-secret") {
  throw new Error(
    "AUTH_ACCESS_TOKEN_SECRET is unset or the known-public default — refusing to start; set a unique secret",
  );
}

const jwt = ElysiaJwt({
  name: "jwt",
  secret: authTokenSecret,
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
  bearer: bearerToken,
  query,
  jwt: jwtVerifier,
}: {
  bearer: string | undefined;
  query: { accessToken?: string };
  jwt: JWT;
}): Promise<string | null> {
  const token = bearerToken ?? query?.accessToken;
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

const setup = new Elysia({ name: "shared" })
  .use(bearer())
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer())
  .state("batchMonitoringQueue", batchMonitoringQueue)
  .decorate("posthog", posthogService)
  .onError(
    { as: "global" },
    async ({
      bearer: bearerToken,
      query,
      jwt: jwtVerifier,
      error,
      code,
      path,
    }) => {
      // NOT_FOUND is expected HTTP behavior (404s), not an application exception
      if (code === "NOT_FOUND") return;

      const distinctId = await maybeCurrentUserId({
        bearer: bearerToken,
        query: query as { accessToken?: string },
        jwt: jwtVerifier,
      });
      posthogService.captureException(error, distinctId ?? "anonymous", {
        code,
        $current_url: path,
      });
    },
  )
  .derive(async ({ jwt, cookie: { auth }, store }) => {
    let payload: any;
    try {
      payload = await jwt.verify(auth?.value as string | undefined);
    } catch {
      console.warn("JWT verification failed");
      return { user: null };
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as any).id !== "string" ||
      !(payload as any).id
    ) {
      return { user: null };
    }

    try {
      const userService = new UserService(store.db);
      const user = await userService.findOne((payload as any).id);
      if (!user) return { user: null };
      return { user };
    } catch {
      console.error("Failed to load user from store");
      return { user: null };
    }
  })
  // @ts-ignore - Elysia macro types are complex and not fully inferred
  .macro(({ onBeforeHandle }: any) => ({
    isAuthenticated() {
      onBeforeHandle(({ user, set }: any) => {
        if (!user) {
          set.status = 401;
          return {
            error: "UNAUTHORIZED",
            message: "Authentication required",
            details: undefined,
          };
        }
      });
    },
  }));

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
import { verseNotificationQueue } from "../notifications/verse-notification.queue";
import {
  registerVerseNotificationCron,
  verseNotificationWorker,
} from "../notifications/verse-notification.worker";
import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { batchProcessingWorker } from "../workers/batch-processing.worker";
import { runsApiWorkers, runsMediaWorkers, workerRole } from "./worker-role";

setup.onStart(async () => {
  // Which workers are this container's job (task 5.3a). Default "all", so a
  // single-container deployment is unchanged; splitting is an opt-in taken the
  // day a second service is added.
  const role = workerRole();
  const apiSide = runsApiWorkers(role);
  const media = runsMediaWorkers(role);
  console.log(`[QUEUE] Starting BullMQ workers (role: ${role})...`);
  if (apiSide && !batchMonitoringWorker.isRunning()) {
    console.log("[QUEUE] Monitoring worker not running, starting it now...");
    batchMonitoringWorker.run();
    console.log("[QUEUE] Monitoring worker started successfully");
  } else {
    console.log("[QUEUE] Monitoring worker already running");
  }

  if (apiSide && !batchProcessingWorker.isRunning()) {
    console.log("[QUEUE] Processing worker not running, starting it now...");
    batchProcessingWorker.run();
    console.log("[QUEUE] Processing worker started successfully");
  } else {
    console.log("[QUEUE] Processing worker already running");
  }

  if (media && !audioGenerationWorker.isRunning()) {
    console.log(
      "[QUEUE] Audio generation worker not running, starting it now...",
    );
    audioGenerationWorker.run();
    console.log("[QUEUE] Audio generation worker started successfully");
  } else {
    console.log("[QUEUE] Audio generation worker already running");
  }

  if (media && !audioCleanupWorker.isRunning()) {
    console.log("[QUEUE] Audio cleanup worker not running, starting it now...");
    audioCleanupWorker.run();
    console.log("[QUEUE] Audio cleanup worker started successfully");
  } else {
    console.log("[QUEUE] Audio cleanup worker already running");
  }

  try {
    // Registered by the container that RUNS the worker, so a repeatable job
    // cannot be scheduled by a container that would never process it.
    if (media) await registerAudioCleanupCron();
  } catch (error) {
    console.error("[QUEUE] Failed to register audio cleanup cron:", error);
  }

  if (apiSide && !verseNotificationWorker.isRunning()) {
    console.log(
      "[QUEUE] Verse notification worker not running, starting it now...",
    );
    verseNotificationWorker.run();
    console.log("[QUEUE] Verse notification worker started successfully");
  } else {
    console.log("[QUEUE] Verse notification worker already running");
  }

  try {
    // Registered by the container that RUNS the worker, so a repeatable job
    // cannot be scheduled by a container that would never process it.
    if (apiSide) await registerVerseNotificationCron();
  } catch (error) {
    console.error("[QUEUE] Failed to register verse notification cron:", error);
  }

  if (media && !coachIntakeWorker.isRunning()) {
    console.log("[QUEUE] Coach intake worker not running, starting it now...");
    coachIntakeWorker.run();
    console.log("[QUEUE] Coach intake worker started successfully");
  } else {
    console.log("[QUEUE] Coach intake worker already running");
  }

  try {
    // Registered by the container that RUNS the worker, so a repeatable job
    // cannot be scheduled by a container that would never process it.
    if (media) await registerCoachIntakeCron();
  } catch (error) {
    console.error("[QUEUE] Failed to register coach intake cron:", error);
  }

  // Check for existing active batches and start monitoring them
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
});

export default setup;

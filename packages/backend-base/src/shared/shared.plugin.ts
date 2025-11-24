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

const jwt = ElysiaJwt({
  name: "jwt",
  secret: process.env.AUTH_ACCESS_TOKEN_SECRET ?? "my-super-secret",
  exp: "15m", // Short-lived access token, refresh token handles long sessions
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

import { batchProcessingQueue } from "../queue/batch-processing.queue";
import { batchProcessingWorker } from "../workers/batch-processing.worker";

setup.onStart(async () => {
  console.log("[QUEUE] Starting BullMQ workers...");
  if (!batchMonitoringWorker.isRunning()) {
    console.log("[QUEUE] Monitoring worker not running, starting it now...");
    batchMonitoringWorker.run();
    console.log("[QUEUE] Monitoring worker started successfully");
  } else {
    console.log("[QUEUE] Monitoring worker already running");
  }

  if (!batchProcessingWorker.isRunning()) {
    console.log("[QUEUE] Processing worker not running, starting it now...");
    batchProcessingWorker.run();
    console.log("[QUEUE] Processing worker started successfully");
  } else {
    console.log("[QUEUE] Processing worker already running");
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
});

export default setup;

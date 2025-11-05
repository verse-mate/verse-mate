import { bearer } from "@elysiajs/bearer";
import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";

import { AuthService } from "../auth/auth.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import { batchMonitoringWorker } from "../queue/queue";
import bullmqRedisConnection from "./bullmq-redis";
import redisClient from "./redis-client";

export type cache = typeof redisClient;

export type db = typeof Database;

const jwt = ElysiaJwt({
  name: "jwt",
  secret: process.env.AUTH_ACCESS_TOKEN_SECRET ?? "my-super-secret",
  exp: process.env.AUTH_ACCESS_TOKEN_LIFETIME ?? "1h",
});

export type JWT = (typeof jwt)["decorator"]["jwt"];

// const storage = new ObjectStorageService();

const setup = new Elysia({ name: "shared" })
  .use(bearer())
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer())
  .state("batchMonitoringQueue", batchMonitoringQueue)
  .derive(async ({ jwt, cookie: { auth }, bearer, store, set }) => {
    const token =
      (auth?.value as string | undefined) ||
      (typeof bearer === "string" && bearer ? bearer : undefined);
    if (!token) {
      return { user: null };
    }

    let payload: any;
    try {
      payload = await jwt.verify(token);
    } catch {
      console.warn("JWT verification failed");
      return { user: null };
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as any).sub !== "string" ||
      !(payload as any).sub
    ) {
      return { user: null };
    }

    // Sliding session logic with safety checks
    const now = Math.floor(Date.now() / 1000);
    const exp = Number((payload as any).exp);
    const iat = Number((payload as any).iat);
    if (Number.isFinite(exp) && Number.isFinite(iat) && exp > iat) {
      const lifetime = exp - iat;
      const timeRemaining = exp - now;

      // If token is more than halfway through its life, refresh it
      if (timeRemaining < lifetime / 2) {
        const authService = new AuthService(
          store.db,
          store.cache,
          store.notification,
          jwt,
        );
        try {
          const newToken = await authService.refreshAccessToken(
            token,
            (payload as any).sub,
          );
          if (newToken) {
            // Use a conventional header and expose it for browsers
            set.headers["Authorization"] = `Bearer ${newToken}`;
            set.headers["Access-Control-Expose-Headers"] = "Authorization";
          }
        } catch (error) {
          // Don't block the request if refresh fails, the old token is still valid for now
          console.error("Failed to refresh access token:", error);
        }
      }
    }

    try {
      const authService = new AuthService(
        store.db,
        store.cache,
        store.notification,
        jwt,
      );
      const user = await authService.getUserById(payload.sub);
      if (!user) return { user: null };
      return { user };
    } catch (error) {
      console.error("Failed to load user from store:", error);
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

setup.onStop(() => {
  console.log("onStop on shared plugin");
  Database.closeConnection();
  redisClient.disconnect();
  bullmqRedisConnection.disconnect();
  batchMonitoringQueue.close();
  batchMonitoringWorker.close();
  batchProcessingQueue.close();
  batchProcessingWorker.close();
});

export default setup;

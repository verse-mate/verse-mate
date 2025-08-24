import { bearer } from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia, t } from "elysia";
import { User } from "../user/entities/user.entity";
import { UserService } from "../user/user.service";

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
  .use(cors())
  .use(bearer())
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer())
  .state("batchMonitoringQueue", batchMonitoringQueue)
  .derive(async ({ jwt, cookie: { auth }, store }) => {
    const payload = await jwt.verify(auth?.value);
    if (!payload) {
      return { user: null };
    }

    const userService = new UserService(store.db);
    const user = await userService.findOne(payload.id as string);

    return {
      user,
    };
  })
  .macro(({ onBeforeHandle }) => {
    return {
      isAuthenticated() {
        onBeforeHandle(({ user, set }) => {
          if (!user) {
            set.status = 401;
            return "Unauthorized";
          }
        });
      },
    };
  });

setup.onStart(async () => {
  console.log("[QUEUE] Starting BullMQ worker...");
  if (!batchMonitoringWorker.isRunning()) {
    console.log("[QUEUE] Worker not running, starting it now...");
    batchMonitoringWorker.run();
    console.log("[QUEUE] Worker started successfully");
  } else {
    console.log("[QUEUE] Worker already running");
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
              jobId: `${batch.openai_batch_id}-startup-${Date.now()}`, // Unique job ID to avoid conflicts
              delay: 10000, // Start monitoring in 10 seconds
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
});

export default setup;

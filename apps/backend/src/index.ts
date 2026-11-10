import { BibleRepository } from "backend-base/src/bible/repository/bible.repository";
import { BibleService } from "backend-base/src/bible/services/bible.service";
import { contractApp } from "backend-base/src/contract/contract-app";
import { openapiDocs } from "backend-base/src/contract/openapi-document";
import bullmqRedisConnection from "backend-base/src/shared/bullmq-redis";
import { verifyRedisOrExit } from "backend-base/src/shared/redis-startup-check";
import { configuredRedisUrl } from "backend-base/src/shared/redis-url";
import {
  runsApiStartup,
  workerRole,
} from "backend-base/src/shared/worker-role";
import { db } from "database";
import { Elysia } from "elysia";
import redis from "./lib/redis";

const role = workerRole();

const REDIS_STARTUP_TIMEOUT_MS = 10_000;

const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;

const app = new Elysia({
  serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES },
})
  .use(contractApp())
  .use(openapiDocs());

// Export type before .listen() to preserve full type information for Eden Treaty
export type App = typeof app;

await verifyRedisOrExit({
  cache: redis,
  queue: bullmqRedisConnection,
  redisUrl: configuredRedisUrl(),
  timeoutMs: REDIS_STARTUP_TIMEOUT_MS,
  exit: (code) => process.exit(code),
});

app.listen(process.env.PORT || 3000, async () => {
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  );

  if (!runsApiStartup(role)) return;

  console.log("🚀 Triggering initial language stats refresh on startup...");
  const refreshLanguageStats = async () => {
    try {
      const bibleService = new BibleService(db, new BibleRepository(db));
      const result = await bibleService.refreshLanguageStats();
      if (result.success) {
        console.log("✅ Language stats refreshed successfully.");
      } else {
        console.error("❌ Failed to refresh language stats on startup.");
      }
    } catch (error) {
      console.error(
        "❌ An error occurred during startup language stats refresh:",
        error,
      );
    }
  };

  Promise.race([
    refreshLanguageStats(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 15000),
    ),
  ]).catch((error) => {
    if (error.message === "Timeout") {
      console.warn("⚠️ Language stats refresh timed out after 15 seconds");
    } else {
      console.error("❌ Language stats refresh failed:", error);
    }
  });
});

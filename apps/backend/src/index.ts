import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  adminPlugin,
  audioPlugin,
  authPlugin,
  biblePlugin,
  healthCheckPlugin,
  offlinePlugin,
  supportPlugin,
  topicPlugin,
  userPlugin,
} from "backend-base";
import { BibleRepository } from "backend-base/src/bible/repository/bible.repository";
import { BibleService } from "backend-base/src/bible/services/bible.service";
import { db } from "database";
import { Elysia } from "elysia";

const app = new Elysia()
  // Handle favicon.ico requests to prevent NOT_FOUND errors from browsers
  .get("/favicon.ico", () => new Response(null, { status: 204 }))
  .use(authPlugin)
  .use(userPlugin)
  .use(biblePlugin)
  .use(audioPlugin)
  .use(topicPlugin)
  .use(supportPlugin)
  .use(adminPlugin)
  .use(offlinePlugin)
  .use(healthCheckPlugin)
  .use(
    cors({
      // Per spec feat-api-contract br-api (D-028): production allowlist; dev permissive.
      // App.versemate.org (mobile web export, future), admin.versemate.org (admin web),
      // versemate.org and www.versemate.org (marketing). Native apps don't need CORS.
      origin:
        process.env.ENVIRONMENT === "production"
          ? [
              "https://app.versemate.org",
              "https://admin.versemate.org",
              "https://versemate.org",
              "https://www.versemate.org",
            ]
          : true, // dev/test: allow all (mobile dev client uses dynamic ports)
    }),
  )
  .use(
    openapi({
      documentation: {
        info: {
          title: "VerseMate API",
          version: "1.0.0",
          description: "Bible reading platform API with AI-driven translations",
        },
        servers: [
          { url: "http://localhost:4000", description: "Development" },
          // Per spec feat-api-contract D-027: canonical production host is .org (matches mobile)
          { url: "https://api.versemate.org", description: "Production" },
        ],
      },
    }),
  );

// Export type before .listen() to preserve full type information for Eden Treaty
export type App = typeof app;

app.listen(process.env.PORT || 3000, async () => {
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  );

  // Asynchronously refresh language stats on startup (fire-and-forget with timeout)
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

  // Execute with timeout protection to avoid blocking startup
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

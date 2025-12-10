import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  adminPlugin,
  authPlugin,
  biblePlugin,
  healthCheckPlugin,
  topicPlugin,
  userPlugin,
} from "backend-base";
import { BibleRepository } from "backend-base/src/bible/repository/bible.repository";
import { BibleService } from "backend-base/src/bible/services/bible.service";
import { db } from "database";
import { Elysia } from "elysia";

const app = new Elysia()
  .use(authPlugin)
  .use(userPlugin)
  .use(biblePlugin)
  .use(topicPlugin)
  .use(adminPlugin)
  .use(healthCheckPlugin)
  .use(cors())
  .use(
    openapi({
      documentation: {
        info: {
          title: "VerseMate API",
          version: "1.0.0",
          description:
            "Bible reading platform API with AI-driven translations and interactive Q&A",
        },
        servers: [
          { url: "http://localhost:4000", description: "Development" },
          { url: "https://api.versemate.com", description: "Production" },
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

import { Elysia } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { StandardErrorResponses } from "../common/response-schemas";
import { ipRateLimit } from "../middleware/rate-limit";
import shared from "../shared/shared.plugin";
import { VerseOfTheDayQueryDto } from "./dto/daily-verse.dto";
import { VerseOfTheDayResponseSchema } from "./schemas/daily-verse-response.schema";
import {
  DailyVerseService,
  todayServerLocal,
} from "./services/daily-verse.service";

const DEFAULT_VERSION_KEY = "NASB1995";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Yesterday (server-local) as YYYY-MM-DD. */
function yesterdayServerLocal(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    dailyVerseService: new DailyVerseService(state.db, undefined, state.cache),
  }))
  .group("/bible", (app) =>
    app.resolve({ as: "scoped" }, authDerive).get(
      "/verse-of-the-day",
      async ({
        query,
        store: { dailyVerseService, db },
        currentUserId,
        posthog,
        set,
      }) => {
        // Date defaults to server-local today; client supplies its local date
        // to honor local-midnight rollover. Restrict to [today-1, today]
        // to keep history/cache from being polluted by arbitrary dates (D-32).
        const date = query.date ?? todayServerLocal();
        if (!DATE_PATTERN.test(date)) {
          set.status = 400;
          return { error: "invalid_date", message: "date must be YYYY-MM-DD" };
        }
        const allowed = new Set([todayServerLocal(), yesterdayServerLocal()]);
        if (!allowed.has(date)) {
          set.status = 400;
          return {
            error: "invalid_date",
            message: "date must be today or yesterday",
          };
        }

        // Resolve the requesting user (for preferred version + future
        // personalization). v1 only reads preferred_bible_version.
        let user = null;
        if (currentUserId) {
          user =
            (await db
              .getOrCreateConnection()
              .selectFrom("user")
              .where("id", "=", currentUserId)
              .selectAll()
              .executeTakeFirst()) ?? null;
        }

        const versionKey =
          query.bible_version ??
          user?.preferred_bible_version ??
          DEFAULT_VERSION_KEY;

        const result = await dailyVerseService.getVerseOfTheDay({
          date,
          versionKey,
          user,
        });

        // Server-side observability via PostHog (D-40).
        if (posthog.isInitialized()) {
          const distinctId = currentUserId ?? "anonymous";
          posthog.capture({
            distinctId,
            event: "DAILY_VERSE_SERVED",
            properties: { date, version: versionKey, empty: result.empty },
          });
          if (!result.empty) {
            if (result.metrics.poolTooSmall) {
              posthog.capture({
                distinctId,
                event: "POOL_TOO_SMALL",
                properties: { date },
              });
            }
            if (result.metrics.missingBookNameLocalization) {
              posthog.capture({
                distinctId,
                event: "MISSING_BOOK_NAME_LOCALIZATION",
                properties: { language: result.languageCode, date },
              });
            }
          }
        }

        if (result.empty) {
          return {
            empty: true as const,
            date: result.date,
            fallbackMessage: result.fallbackMessage,
          };
        }

        // Map to the public payload, dropping the internal `metrics` field.
        return {
          empty: false as const,
          reference: result.reference,
          referenceText: result.referenceText,
          verses: result.verses,
          tags: result.tags,
          versionKey: result.versionKey,
          languageCode: result.languageCode,
          date: result.date,
        };
      },
      {
        beforeHandle: ipRateLimit,
        query: VerseOfTheDayQueryDto,
        response: {
          200: VerseOfTheDayResponseSchema,
          ...StandardErrorResponses,
        },
        detail: {
          tags: ["Bible"],
          summary: "Verse of the day",
          description:
            "Returns the curated verse for a date in the requested translation, with NASB1995 fallback. Returns { empty: true } when no verse is available.",
        },
      },
    ),
  );

export type DailyVersePlugin = typeof plugin;

export default plugin;

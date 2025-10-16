import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { BibleRepository } from "../bible/repository/bible.repository";
import { BibleService } from "../bible/services/bible.service";
import shared from "../shared/shared.plugin";
import { parseAndInjectVerses } from "../shared/verse-parser";
import { TopicService } from "./services/topic.service";

// Response schemas
const CategoryResponseSchema = t.Object({
  categories: t.Array(t.String()),
});

// Schema for topic search results (limited fields from repository)
const TopicSearchItemSchema = t.Object({
  topic_id: t.String({ format: "uuid" }),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  sort_order: t.Union([t.Number(), t.Null()]),
  is_translated: t.Optional(t.Boolean()),
});

const TopicSearchResponseSchema = t.Object({
  topics: t.Array(TopicSearchItemSchema),
});

// Schema for full topic details (all fields from database)
const TopicSchema = t.Object({
  topic_id: t.String({ format: "uuid" }),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.String(),
  sort_order: t.Union([t.Number(), t.Null()]),
  is_active: t.Union([t.Boolean(), t.Null()]),
  created_at: t.Union([t.Date(), t.Null()]),
  updated_at: t.Union([t.Date(), t.Null()]),
  is_translated: t.Optional(t.Boolean()),
});

// Schema for topic references (only content field from repository)
const TopicReferencesSchema = t.Object({
  content: t.String(),
});

const TopicDetailsResponseSchema = t.Object({
  topic: t.Union([TopicSchema, t.Null()]),
  references: t.Union([TopicReferencesSchema, t.Null()]),
  explanation: t.Object({
    summary: t.String(),
    byline: t.String(),
    detailed: t.String(),
  }),
});

const TopicReferencesResponseSchema = t.Object({
  references: t.Union([TopicReferencesSchema, t.Null()]),
});

// Schema for topic explanation (only explanation field from repository)
const TopicExplanationSchema = t.Object({
  explanation: t.String(),
});

const TopicExplanationResponseSchema = t.Object({
  explanation: t.Union([TopicExplanationSchema, t.Null()]),
});

const ParseReferencesResponseSchema = t.Object({
  parsedContent: t.String(),
});

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      topicService: new TopicService(state.db),
      bibleService: new BibleService(state.db, new BibleRepository(state.db)),
    };
  })
  .group("/topics", (app) =>
    app
      .get(
        "/categories",
        async ({ store: { topicService } }) => {
          const categories = await topicService.getCategories();
          return { categories };
        },
        {
          response: CategoryResponseSchema,
        },
      )
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/search",
        async ({ query, store: { topicService, db }, currentUserId }) => {
          const { category, bible_version } = query;

          // Determine language: user preference overrides Bible version language
          let languageCode = "en-US"; // Default fallback

          if (bible_version) {
            const version = await db
              .getOrCreateConnection()
              .selectFrom("bible_versions")
              .where("version_key", "=", bible_version)
              .select("language_code")
              .executeTakeFirst();

            if (version) {
              languageCode = version.language_code;
            }
          }

          // If user is logged in, check for preferred language override
          if (currentUserId) {
            const user = await db
              .getOrCreateConnection()
              .selectFrom("user")
              .where("id", "=", currentUserId)
              .select("preferred_language")
              .executeTakeFirst();

            // Override language if user has a preference
            if (user?.preferred_language) {
              languageCode = user.preferred_language;
            }
          }

          const topics = await topicService.getTopicsByCategory(
            category,
            languageCode,
          );
          return { topics };
        },
        {
          query: t.Object({
            category: t.String(),
            bible_version: t.Optional(t.String()),
          }),
          response: TopicSearchResponseSchema,
        },
      )
      .get(
        "/:id",
        async ({ params, query, store, currentUserId }) => {
          const { id } = params;
          const { bible_version } = query;
          const { topicService, db } = store;

          // Determine language: user preference overrides Bible version language
          let languageCode = "en-US"; // Default fallback

          if (bible_version) {
            const version = await db
              .getOrCreateConnection()
              .selectFrom("bible_versions")
              .where("version_key", "=", bible_version)
              .select("language_code")
              .executeTakeFirst();

            if (version) {
              languageCode = version.language_code;
            }
          }

          // If user is logged in, check for preferred language override
          if (currentUserId) {
            const user = await db
              .getOrCreateConnection()
              .selectFrom("user")
              .where("id", "=", currentUserId)
              .select("preferred_language")
              .executeTakeFirst();

            // Override language if user has a preference
            if (user?.preferred_language) {
              languageCode = user.preferred_language;
            }
          }

          const topic = await topicService.getTopic(id, languageCode);
          const references = await topicService.getTopicReferences(id);

          // Fetch real explanations for all types in the requested language
          const [summaryExplanation, bylineExplanation, detailedExplanation] =
            await Promise.all([
              topicService.getTopicExplanation(id, languageCode, "summary"),
              topicService.getTopicExplanation(id, languageCode, "byline"),
              topicService.getTopicExplanation(id, languageCode, "detailed"),
            ]);

          if (bylineExplanation?.explanation && bible_version) {
            bylineExplanation.explanation = await parseAndInjectVerses(
              bylineExplanation.explanation,
              bible_version,
              db,
              { includeVerseNumbers: false }, // Don't include verse numbers in byline
            );
          }

          const explanation = {
            summary:
              summaryExplanation?.explanation ||
              "No summary explanation available.",
            byline:
              bylineExplanation?.explanation ||
              "No byline explanation available.",
            detailed:
              detailedExplanation?.explanation ||
              "No detailed explanation available.",
          };

          return {
            topic: topic || null,
            references: references || null,
            explanation,
          };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
          }),
          query: t.Object({
            bible_version: t.Optional(t.String()),
          }),
          response: TopicDetailsResponseSchema,
        },
      )
      .get(
        "/:id/references",
        async ({ params, query, store }) => {
          const { id } = params;
          const { version = "NASB1995" } = query;
          const { topicService, db } = store;
          const references = await topicService.getTopicReferences(id);
          if (references?.content) {
            const processedContent = await parseAndInjectVerses(
              references.content,
              version,
              db,
              { includeReference: true, includeVerseNumbers: true },
            );
            return { references: { ...references, content: processedContent } };
          }
          return { references: references || null };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
          }),
          query: t.Object({
            version: t.Optional(t.String()),
          }),
          response: TopicReferencesResponseSchema,
        },
      )
      .get(
        "/:id/explanation",
        async ({ params, query, store: { topicService } }) => {
          const { id } = params;
          const { type = "detailed", lang = "en" } = query;
          const explanation = await topicService.getTopicExplanation(
            id,
            lang,
            type,
          );
          return { explanation: explanation || null };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
          }),
          query: t.Object({
            type: t.Optional(
              t.Union([
                t.Literal("summary"),
                t.Literal("byline"),
                t.Literal("detailed"),
              ]),
            ),
            lang: t.Optional(t.String()),
          }),
          response: TopicExplanationResponseSchema,
        },
      )
      .post(
        "/parse-references",
        async ({ body, store: { topicService } }) => {
          const { content, bibleVersion } = body;
          const parsedContent = await topicService.parseTopicReferences(
            content,
            bibleVersion,
          );
          return { parsedContent };
        },
        {
          body: t.Object({
            content: t.String(),
            bibleVersion: t.String(),
          }),
          response: ParseReferencesResponseSchema,
        },
      ),
  );

export type TopicPlugin = typeof plugin;

export default plugin;

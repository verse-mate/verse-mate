import { Elysia, t } from "elysia";
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
      .get(
        "/search",
        async ({ query, store: { topicService } }) => {
          const { category } = query;
          const topics = await topicService.getTopicsByCategory(category);
          return { topics };
        },
        {
          query: t.Object({
            category: t.String(),
          }),
          response: TopicSearchResponseSchema,
        },
      )
      .get(
        "/:id",
        async ({ params, store }) => {
          const { id } = params;
          const { topicService, db } = store;
          const topic = await topicService.getTopic(id);
          const references = await topicService.getTopicReferences(id);
          // Fetch real explanations for all types
          const [summaryExplanation, bylineExplanation, detailedExplanation] =
            await Promise.all([
              topicService.getTopicExplanation(id, "en-US", "summary"),
              topicService.getTopicExplanation(id, "en-US", "byline"),
              topicService.getTopicExplanation(id, "en-US", "detailed"),
            ]);

          if (bylineExplanation?.explanation) {
            bylineExplanation.explanation = await parseAndInjectVerses(
              bylineExplanation.explanation,
              "NASB1995", // Assuming a default version, or get from query
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

import { Elysia, t } from "elysia";
import { BibleRepository } from "../bible/repository/bible.repository";
import { BibleService } from "../bible/services/bible.service";
import shared from "../shared/shared.plugin";
import { parseAndInjectVerses } from "../shared/verse-parser";
import { TopicService } from "./services/topic.service";

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
      .get("/categories", async ({ store: { topicService } }) => {
        const categories = await topicService.getCategories();
        return { categories };
      })
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
        },
      )
      .get(
        "/:id",
        async ({ params, store: { topicService } }) => {
          const { id } = params;
          const topic = await topicService.getTopic(id);
          const references = await topicService.getTopicReferences(id);
          // Fetch real explanations for all types
          const [summaryExplanation, bylineExplanation, detailedExplanation] =
            await Promise.all([
              topicService.getTopicExplanation(id, "en", "summary"),
              topicService.getTopicExplanation(id, "en", "byline"),
              topicService.getTopicExplanation(id, "en", "detailed"),
            ]);

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
            topic,
            references,
            explanation,
          };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
          }),
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
            );
            return { references: { ...references, content: processedContent } };
          }
          return { references };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
          }),
          query: t.Object({
            version: t.Optional(t.String()),
          }),
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
          return { explanation };
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
        },
      ),
  );

export type TopicPlugin = typeof plugin;

export default plugin;

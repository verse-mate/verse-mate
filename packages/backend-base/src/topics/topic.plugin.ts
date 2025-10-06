import { Elysia, t } from "elysia";
import shared from "../shared/shared.plugin";
import { TopicService } from "./services/topic.service";

const plugin = new Elysia()
  .use(shared)
  .state((state) => {
    return {
      ...state,
      topicService: new TopicService(state.db),
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
          // For now, we'll just return a placeholder for the explanation.
          // In the future, this will fetch the real explanation.
          const explanation = {
            summary: "Summary explanation placeholder.",
            byline: "Byline explanation placeholder.",
            detailed: "Detailed explanation placeholder.",
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
        async ({ params, store: { topicService } }) => {
          const { id } = params;
          const references = await topicService.getTopicReferences(id);
          return { references };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
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
            type: t.Optional(t.String()),
            lang: t.Optional(t.String()),
          }),
        },
      ),
  );

export type TopicPlugin = typeof plugin;

export default plugin;

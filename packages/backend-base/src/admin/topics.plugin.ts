import { Elysia, t } from "elysia";
import { TopicDto, UpdateTopicDto } from "../topics/dto/topic.dto";

// This is now a simple Elysia instance that defines a group of routes.
// It will inherit its context (like the store and guards) from whatever plugin uses it.
const adminTopicPlugin = new Elysia().group("/topics", (app) =>
  app
    .get("/", async ({ store }: any) => {
      const topics = await store.topicService.getAllTopics();
      return { topics };
    })
    .post(
      "/",
      async ({ body, store }: any) => {
        const newTopic = await store.topicService.createTopic(body);
        return { topic: newTopic };
      },
      {
        body: TopicDto,
      },
    )
    .put(
      "/:id",
      async ({ params, body, store }: any) => {
        const updatedTopic = await store.topicService.updateTopic(
          params.id,
          body,
        );
        return { topic: updatedTopic };
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
        }),
        body: UpdateTopicDto,
      },
    )
    .delete(
      "/:id",
      async ({ params, store }: any) => {
        await store.topicService.deleteTopic(params.id);
        return { success: true };
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
        }),
      },
    )
    // New endpoint for chronological sorting
    .post(
      "/sort-chronologically",
      async ({ body, store }: any) => {
        const result =
          await store.topicService.sortTopicsChronologicallyByCategory(
            body.category,
          );
        return result;
      },
      {
        body: t.Object({
          category: t.String(),
        }),
      },
    )
    // Topic translation endpoints
    .post(
      "/translate-names",
      async ({ body, store, currentUserId }: any) => {
        const {
          model,
          source_language_code = "en-US",
          target_language_code,
          skip_existing = false,
          effort = "low",
          category,
          topic_id,
        } = body;

        const batchOperationService = store.getBatchOperationService();
        const batch =
          await batchOperationService.generateTopicNameTranslationBatch(
            model,
            currentUserId,
            source_language_code,
            target_language_code,
            skip_existing,
            effort,
            category,
            topic_id,
          );

        return {
          success: true,
          batchId: batch?.id,
          message: "Topic name translation batch created successfully",
        };
      },
      {
        body: t.Object({
          model: t.String(),
          source_language_code: t.Optional(t.String()),
          target_language_code: t.String(),
          skip_existing: t.Optional(t.Boolean()),
          effort: t.Optional(
            t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high")]),
          ),
          category: t.Optional(t.String()),
          topic_id: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/translate-explanations",
      async ({ body, store, currentUserId }: any) => {
        const {
          model,
          source_language_code = "en-US",
          target_language_code,
          explanation_types = ["summary", "byline", "detailed"],
          skip_existing = false,
          effort = "medium",
          category,
          topic_id,
        } = body;

        const batchOperationService = store.getBatchOperationService();
        const batch =
          await batchOperationService.generateTopicExplanationTranslationBatch(
            model,
            currentUserId,
            source_language_code,
            target_language_code,
            explanation_types,
            skip_existing,
            effort,
            category,
            topic_id,
          );

        return {
          success: true,
          batchId: batch?.id,
          message: "Topic explanation translation batch created successfully",
        };
      },
      {
        body: t.Object({
          model: t.String(),
          source_language_code: t.Optional(t.String()),
          target_language_code: t.String(),
          explanation_types: t.Optional(t.Array(t.String())),
          skip_existing: t.Optional(t.Boolean()),
          effort: t.Optional(
            t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high")]),
          ),
          category: t.Optional(t.String()),
          topic_id: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/translate-all",
      async ({ body, store, currentUserId }: any) => {
        const {
          model,
          source_language_code = "en-US",
          target_language_code,
          explanation_types = ["summary", "byline", "detailed"],
          skip_existing = false,
          effort = "medium",
          category,
          topic_id,
        } = body;

        const batchOperationService = store.getBatchOperationService();
        const result =
          await batchOperationService.generateTopicCompleteTranslationBatch(
            model,
            currentUserId,
            source_language_code,
            target_language_code,
            explanation_types,
            skip_existing,
            effort,
            category,
            topic_id,
          );

        return {
          success: true,
          parentBatchId: result.parentBatchId,
          childBatches: result.childBatches,
          totalRequests: result.totalRequests,
          message: "Complete topic translation batch created successfully",
        };
      },
      {
        body: t.Object({
          model: t.String(),
          source_language_code: t.Optional(t.String()),
          target_language_code: t.String(),
          explanation_types: t.Optional(t.Array(t.String())),
          skip_existing: t.Optional(t.Boolean()),
          effort: t.Optional(
            t.Union([t.Literal("low"), t.Literal("medium"), t.Literal("high")]),
          ),
          category: t.Optional(t.String()),
          topic_id: t.Optional(t.String()),
        }),
      },
    ),
);

export default adminTopicPlugin;

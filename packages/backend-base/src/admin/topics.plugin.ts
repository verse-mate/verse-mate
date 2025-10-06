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
    ),
);

export default adminTopicPlugin;

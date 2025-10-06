import { Elysia, type Static, t } from "elysia";
import shared from "../shared/shared.plugin";
import { TopicDto, UpdateTopicDto } from "../topics/dto/topic.dto";
import { TopicService } from "../topics/services/topic.service";

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    topicService: new TopicService(state.db),
  }))
  .group("/topics", (app) =>
    app
      .get("/", async ({ store }) => {
        const topics = await store.topicService.getAllTopics();
        return { topics };
      })
      .post(
        "/",
        async ({ body, store }) => {
          const newTopic = await store.topicService.createTopic(body);
          return { topic: newTopic };
        },
        {
          body: TopicDto,
        },
      )
      .put(
        "/:id",
        async ({ params, body, store }) => {
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
        async ({ params, store }) => {
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

export type AdminTopicPlugin = typeof plugin;

export default plugin;

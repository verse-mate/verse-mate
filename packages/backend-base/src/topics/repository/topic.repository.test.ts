import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { db as Database } from "database";
import { TopicRepository } from "./topic.repository";

const languageCode = `q'${faker.string.alpha(4).toLowerCase()}`;

describe("TopicRepository with a language code that needs escaping", () => {
  const repository = new TopicRepository(Database);
  const conn = () => Database.getOrCreateConnection();
  const translatedName = faker.lorem.words(3);
  let topic: { topic_id: string; category: string; slug: string };

  beforeAll(async () => {
    topic = await conn()
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select(["topic_id", "category", "slug"])
      .executeTakeFirstOrThrow();

    await conn()
      .insertInto("topic_translations")
      .values({
        topic_id: topic.topic_id,
        language_code: languageCode,
        translated_name: translatedName,
        is_active: true,
      })
      .execute();
  });

  afterAll(async () => {
    await conn()
      .deleteFrom("topic_translations")
      .where("language_code", "=", languageCode)
      .execute();
    Database.closeConnection();
  });

  it("getTopicsByCategory returns the translation stored under that code", async () => {
    const topics = await repository.getTopicsByCategory(
      topic.category,
      languageCode,
    );
    const found = topics.find((t) => t.topic_id === topic.topic_id);
    expect(found?.name).toBe(translatedName);
  });

  it("getTopic returns the translation stored under that code", async () => {
    const found = await repository.getTopic(topic.topic_id, languageCode);
    expect(found?.name).toBe(translatedName);
  });

  it("getTopicBySlug returns the translation stored under that code", async () => {
    const found = await repository.getTopicBySlug(
      topic.category,
      topic.slug,
      languageCode,
    );
    expect(found?.name).toBe(translatedName);
  });
});

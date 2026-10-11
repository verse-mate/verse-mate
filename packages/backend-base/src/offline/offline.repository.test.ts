import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { db as Database } from "database";
import { OfflineRepository } from "./offline.repository";

const languageCode = `q'${faker.string.alpha(4).toLowerCase()}`;

describe("OfflineRepository.getAllTopics", () => {
  const repository = new OfflineRepository(Database);
  const conn = () => Database.getOrCreateConnection();
  const translatedName = faker.lorem.words(3);
  let topicId: string;

  beforeAll(async () => {
    const topic = await conn()
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select("topic_id")
      .executeTakeFirstOrThrow();
    topicId = topic.topic_id;

    await conn()
      .insertInto("topic_translations")
      .values({
        topic_id: topicId,
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

  it("returns only the translations stored under a code that needs escaping", async () => {
    const { topics } = await repository.getAllTopics(languageCode);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      topic_id: topicId,
      name: translatedName,
      language_code: languageCode,
    });
  });

  it("still serves the untranslated originals for English", async () => {
    const active = await conn()
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirstOrThrow();

    for (const code of ["en", "en-US"]) {
      const { topics } = await repository.getAllTopics(code);
      expect(topics.length).toBeGreaterThanOrEqual(Number(active.count));
    }
  });
});

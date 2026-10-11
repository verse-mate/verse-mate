import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { db as Database } from "database";
import { OfflineRepository } from "./offline.repository";

const FIXTURE_CODE_PATTERN = "q'%";
const languageCode = `q'${faker.string.alpha(4).toLowerCase()}`;

describe("OfflineRepository topics", () => {
  const repository = new OfflineRepository(Database);
  const conn = () => Database.getOrCreateConnection();
  const translatedName = faker.lorem.words(3);
  let topicId: string;

  const removeFixtures = () =>
    conn()
      .deleteFrom("topic_translations")
      .where("language_code", "like", FIXTURE_CODE_PATTERN)
      .execute();

  beforeAll(async () => {
    await removeFixtures();

    const topic = await conn()
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select("topic_id")
      .orderBy("topic_id")
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
    await removeFixtures();
    Database.closeConnection();
  });

  it("getAllTopics returns only the translations stored under a code that needs escaping", async () => {
    const { topics } = await repository.getAllTopics(languageCode);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      topic_id: topicId,
      name: translatedName,
      language_code: languageCode,
    });
  });

  it("getAllTopics serves the untranslated originals for English", async () => {
    const active = await conn()
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select(["topic_id", "name"])
      .execute();
    const translated = new Set(
      (
        await conn()
          .selectFrom("topic_translations")
          .where("language_code", "=", "en")
          .select("topic_id")
          .execute()
      ).map((row) => row.topic_id),
    );

    const { topics } = await repository.getAllTopics("en");
    const byId = new Map(topics.map((t) => [t.topic_id, t]));

    for (const topic of active) {
      expect(byId.has(topic.topic_id)).toBe(true);
      if (!translated.has(topic.topic_id)) {
        expect(byId.get(topic.topic_id)).toMatchObject({
          name: topic.name,
          language_code: "en",
        });
      }
    }
  });

  it("getAllTopics serves no originals for a language other than English", async () => {
    const { topics } = await repository.getAllTopics(languageCode);
    expect(topics.every((t) => t.language_code === languageCode)).toBe(true);
  });

  it("buildManifest lists a stored code that is not a well-formed language tag", async () => {
    const manifest = await repository.buildManifest();
    const entry = manifest.topic_languages.find(
      (lang) => lang.code === languageCode,
    );
    expect(entry?.name).toBe(languageCode);
  });
});

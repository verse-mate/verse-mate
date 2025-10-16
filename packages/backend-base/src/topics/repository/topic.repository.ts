import type { Topics } from "database/src/models/public/Topics";
import type { Insertable, Updateable } from "kysely";
import type { db } from "../../shared/shared.plugin";

export class TopicRepository {
  constructor(private readonly db: db) {}

  async getCategories() {
    const categories = await this.db
      .getOrCreateConnection()
      .selectFrom("topics")
      .select("category")
      .distinct()
      .orderBy("category")
      .execute();

    return categories.map((row) => row.category);
  }

  async getTopicsByCategory(category: string, bibleVersion?: string) {
    const connection = this.db.getOrCreateConnection();

    // Look up language code from Bible version
    let languageCode = "en-US"; // Default fallback
    if (bibleVersion) {
      const version = await connection
        .selectFrom("bible_versions")
        .where("version_key", "=", bibleVersion)
        .select("language_code")
        .executeTakeFirst();

      if (version) {
        languageCode = version.language_code;
      }
    }

    const topics = await connection
      .selectFrom("topics")
      .leftJoin("topic_translations", (join) =>
        join
          .onRef("topics.topic_id", "=", "topic_translations.topic_id")
          .on("topic_translations.language_code", "=", languageCode)
          .on("topic_translations.is_active", "=", true),
      )
      .where("topics.category", "=", category)
      .where("topics.is_active", "=", true)
      .select([
        "topics.topic_id",
        "topics.name as original_name",
        "topics.description as original_description",
        "topics.sort_order",
        "topic_translations.translated_name",
        "topic_translations.translated_description",
      ])
      .orderBy("topics.sort_order")
      .orderBy("topics.name")
      .execute();

    return topics.map((topic) => ({
      topic_id: topic.topic_id,
      name: topic.translated_name || topic.original_name,
      description:
        topic.translated_description || topic.original_description || null,
      sort_order: topic.sort_order,
      is_translated: !!topic.translated_name,
    }));
  }

  async getAllTopics() {
    return await this.db
      .getOrCreateConnection()
      .selectFrom("topics")
      .selectAll()
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
  }

  async getTopic(topicId: string, bibleVersion?: string) {
    const connection = this.db.getOrCreateConnection();

    // Look up language code from Bible version
    let languageCode = "en-US"; // Default fallback
    if (bibleVersion) {
      const version = await connection
        .selectFrom("bible_versions")
        .where("version_key", "=", bibleVersion)
        .select("language_code")
        .executeTakeFirst();

      if (version) {
        languageCode = version.language_code;
      }
    }

    const topic = await connection
      .selectFrom("topics")
      .leftJoin("topic_translations", (join) =>
        join
          .onRef("topics.topic_id", "=", "topic_translations.topic_id")
          .on("topic_translations.language_code", "=", languageCode)
          .on("topic_translations.is_active", "=", true),
      )
      .where("topics.topic_id", "=", topicId)
      .select([
        "topics.topic_id",
        "topics.name as original_name",
        "topics.description as original_description",
        "topics.category",
        "topics.sort_order",
        "topics.is_active",
        "topics.created_at",
        "topics.updated_at",
        "topic_translations.translated_name",
        "topic_translations.translated_description",
      ])
      .executeTakeFirst();

    if (!topic) {
      return null;
    }

    return {
      topic_id: topic.topic_id,
      name: topic.translated_name || topic.original_name,
      description:
        topic.translated_description || topic.original_description || null,
      category: topic.category,
      sort_order: topic.sort_order,
      is_active: topic.is_active,
      created_at: topic.created_at,
      updated_at: topic.updated_at,
      is_translated: !!topic.translated_name,
    };
  }

  async createTopic(topic: Omit<Insertable<Topics>, "topic_id">) {
    return await this.db
      .getOrCreateConnection()
      .insertInto("topics")
      .values(topic)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateTopic(topicId: string, topic: Updateable<Topics>) {
    try {
      const result = await this.db
        .getOrCreateConnection()
        .updateTable("topics")
        .set(topic)
        .where("topic_id", "=", topicId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
    } catch (error) {
      console.error(`Error updating topic ${topicId}:`, error);
      throw error;
    }
  }

  async deleteTopic(topicId: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("topics")
      .where("topic_id", "=", topicId)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  async saveTopicReferences(topicId: string, content: string) {
    await this.db
      .getOrCreateConnection()
      .insertInto("topic_references")
      .values({
        topic_id: topicId,
        content: content,
        is_active: true,
        created_by_admin: false,
      })
      .onConflict((oc) =>
        oc.columns(["topic_id"]).doUpdateSet({
          content: content,
          is_active: true,
          created_by_admin: false,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  async getTopicReferences(topicId: string) {
    const references = await this.db
      .getOrCreateConnection()
      .selectFrom("topic_references")
      .where("topic_id", "=", topicId)
      .where("is_active", "=", true)
      .select(["content"])
      .executeTakeFirst();

    return references;
  }

  async saveTopicExplanation(
    topicId: string,
    explanation: string,
    languageCode: string,
    type: string,
  ) {
    await this.db
      .getOrCreateConnection()
      .insertInto("topic_explanations")
      .values({
        topic_id: topicId,
        explanation: explanation,
        language_code: languageCode,
        type: type,
        is_active: true,
        default: false,
        version: 1,
      })
      .onConflict((oc) =>
        oc.columns(["topic_id", "language_code", "type"]).doUpdateSet({
          explanation: explanation,
          is_active: true,
          default: false,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  async getTopicExplanation(
    topicId: string,
    languageCode: string,
    type: string,
  ) {
    const topicExplanation = await this.db
      .getOrCreateConnection()
      .selectFrom("topic_explanations")
      .where("topic_id", "=", topicId)
      .where("language_code", "=", languageCode)
      .where("type", "=", type)
      .where("is_active", "=", true)
      .select(["explanation"])
      .orderBy("version", "desc")
      .executeTakeFirst();

    return topicExplanation;
  }
}

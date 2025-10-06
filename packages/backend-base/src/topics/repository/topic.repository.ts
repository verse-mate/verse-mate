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

  async getTopicsByCategory(category: string) {
    const topics = await this.db
      .getOrCreateConnection()
      .selectFrom("topics")
      .where("category", "=", category)
      .where("is_active", "=", true)
      .select(["topic_id", "name", "description", "sort_order"])
      .orderBy("sort_order")
      .orderBy("name")
      .execute();

    return topics;
  }

  async getTopic(topicId: string) {
    const topic = await this.db
      .getOrCreateConnection()
      .selectFrom("topics")
      .where("topic_id", "=", topicId)
      .selectAll()
      .executeTakeFirst();

    return topic;
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

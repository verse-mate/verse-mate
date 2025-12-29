import type SupportSenderEnum from "database/src/models/public/SupportSenderEnum";
import type SupportStatusEnum from "database/src/models/public/SupportStatusEnum";
import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

export class SupportRepository {
  constructor(private readonly db: db) {}

  async getConversationsByUserId(userId: string) {
    return await this.db
      .getOrCreateConnection()
      .selectFrom("support_conversations")
      .where("user_id", "=", userId)
      .selectAll()
      .orderBy("last_message_at", "desc")
      .execute();
  }

  async getConversationById(id: string) {
    return await this.db
      .getOrCreateConnection()
      .selectFrom("support_conversations")
      .where("id", "=", id)
      .selectAll()
      .executeTakeFirst();
  }

  async getConversationBySlackThreadTs(slackThreadTs: string) {
    return await this.db
      .getOrCreateConnection()
      .selectFrom("support_conversations")
      .where("slack_thread_ts", "=", slackThreadTs)
      .selectAll()
      .executeTakeFirst();
  }

  async createConversation(
    userId: string,
    slackThreadTs: string,
    subject?: string,
  ) {
    return await this.db
      .getOrCreateConnection()
      .insertInto("support_conversations")
      .values({
        user_id: userId,
        slack_thread_ts: slackThreadTs,
        subject: subject || null,
        status: "open" as SupportStatusEnum,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateConversationLastMessageAt(conversationId: string) {
    return await this.db
      .getOrCreateConnection()
      .updateTable("support_conversations")
      .set({
        last_message_at: sql`CURRENT_TIMESTAMP`,
      })
      .where("id", "=", conversationId)
      .execute();
  }

  async addMessage(
    conversationId: string,
    userId: string,
    text: string,
    sender: SupportSenderEnum,
  ) {
    return await this.db
      .getOrCreateConnection()
      .insertInto("support_messages")
      .values({
        conversation_id: conversationId,
        user_id: userId,
        text,
        sender,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getMessagesByConversationId(conversationId: string) {
    return await this.db
      .getOrCreateConnection()
      .selectFrom("support_messages")
      .where("conversation_id", "=", conversationId)
      .selectAll()
      .orderBy("created_at", "asc")
      .execute();
  }
}

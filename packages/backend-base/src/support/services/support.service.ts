import crypto from "node:crypto";
import { WebClient } from "@slack/web-api";
import type SupportSenderEnum from "database/src/models/public/SupportSenderEnum";
import type { db } from "../../shared/shared.plugin";
import { SupportRepository } from "../repository/support.repository";

export class SupportService {
  private slackClient: WebClient;
  private channelId: string;
  private supportRepository: SupportRepository;

  constructor(private readonly db: db) {
    this.slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.channelId = process.env.SLACK_SUPPORT_CHANNEL_ID || "";
    this.supportRepository = new SupportRepository(db);
  }

  async handleNewConversation(userId: string, text: string, subject?: string) {
    // 1. Get user info for Slack
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .select(["firstName", "lastName", "email"])
      .executeTakeFirst();

    const userName = user
      ? `${user.firstName} ${user.lastName}`
      : "Unknown User";
    const userEmail = user ? user.email : "Unknown Email";

    // 2. Create Slack thread (new top-level message)
    const result = await this.slackClient.chat.postMessage({
      channel: this.channelId,
      text: `New conversation from *${userName}* (${userEmail})${subject ? `\n*Subject:* ${subject}` : ""}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*New Support Request*\n*User:* ${userName}\n*Email:* ${userEmail}${subject ? `\n*Subject:* ${subject}` : ""}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: text,
          },
        },
      ],
    });

    if (result.ok && result.ts) {
      // 3. Create conversation in DB
      const conversation = await this.supportRepository.createConversation(
        userId,
        result.ts,
        subject,
      );

      // 4. Save the first message
      await this.supportRepository.addMessage(
        conversation.id,
        userId,
        text,
        "user" as SupportSenderEnum,
      );

      return { success: true, conversationId: conversation.id };
    }

    throw new Error("Failed to start Slack thread");
  }

  async handleUserMessage(
    userId: string,
    conversationId: string,
    text: string,
  ) {
    // 1. Verify conversation belongs to user
    const conversation =
      await this.supportRepository.getConversationById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      throw new Error("Conversation not found");
    }

    // 2. Save message to DB
    await this.supportRepository.addMessage(
      conversationId,
      userId,
      text,
      "user" as SupportSenderEnum,
    );

    // 3. Post reply to Slack thread
    await this.slackClient.chat.postMessage({
      channel: this.channelId,
      thread_ts: conversation.slack_thread_ts,
      text: text,
    });

    // 4. Update last_message_at
    await this.supportRepository.updateConversationLastMessageAt(
      conversationId,
    );

    return { success: true };
  }

  async handleSlackReply(event: any) {
    // 1. Filter bot messages
    if (event.bot_id || event.subtype === "bot_message") {
      return { success: true, ignored: true };
    }

    // 2. Identify Thread
    const threadTs = event.thread_ts;
    if (!threadTs) {
      return { success: true, ignored: true, reason: "Not a thread reply" };
    }

    // 3. Match Conversation
    const conversation =
      await this.supportRepository.getConversationBySlackThreadTs(threadTs);
    if (!conversation) {
      return {
        success: true,
        ignored: true,
        reason: "No matching conversation found",
      };
    }

    // 4. Save message
    await this.supportRepository.addMessage(
      conversation.id,
      conversation.user_id,
      event.text,
      "support" as SupportSenderEnum,
    );

    // 5. Update last_message_at
    await this.supportRepository.updateConversationLastMessageAt(
      conversation.id,
    );

    // TODO: Send push notification to user

    return { success: true };
  }

  async getConversations(userId: string) {
    return await this.supportRepository.getConversationsByUserId(userId);
  }

  async getMessages(conversationId: string, userId: string) {
    // Verify ownership
    const conversation =
      await this.supportRepository.getConversationById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      throw new Error("Conversation not found");
    }

    const messages =
      await this.supportRepository.getMessagesByConversationId(conversationId);
    return messages.map((m) => ({
      ...m,
      created_at:
        m.created_at instanceof Date
          ? m.created_at.toISOString()
          : m.created_at,
    }));
  }

  verifySlackSignature(signature: string, timestamp: string, body: string) {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.warn(
        "SLACK_SIGNING_SECRET not set, skipping signature verification",
      );
      return true;
    }

    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto
      .createHmac("sha256", signingSecret)
      .update(baseString)
      .digest("hex");
    const computedSignature = `v0=${hmac}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature),
    );
  }
}

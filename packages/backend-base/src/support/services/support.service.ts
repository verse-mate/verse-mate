import crypto from "node:crypto";
import { WebClient } from "@slack/web-api";
import type SupportSenderEnum from "database/src/models/public/SupportSenderEnum";
import { NotFoundError } from "../../common/errors";
import type { db } from "../../shared/shared.plugin";
import { SupportRepository } from "../repository/support.repository";

const SLACK_REQUEST_MAX_AGE_SECONDS = 5 * 60;

const SLACK_SECTION_MAX_LENGTH = 3000;

const escapeSlackText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const decodeSlackText = (value: string) =>
  value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const slackSections = (text: string) => {
  const chunks = [""];
  for (const char of text) {
    const escaped = escapeSlackText(char);
    if (
      chunks[chunks.length - 1].length + escaped.length >
      SLACK_SECTION_MAX_LENGTH
    ) {
      chunks.push("");
    }
    chunks[chunks.length - 1] += escaped;
  }
  return chunks.map((chunk) => ({
    type: "section" as const,
    text: { type: "mrkdwn" as const, text: chunk },
  }));
};

export class SupportService {
  private slackClient: WebClient;
  private channelId: string;
  private supportRepository: SupportRepository;

  constructor(private readonly db: db) {
    this.slackClient = new WebClient(process.env.SLACK_BOT_TOKEN, {
      slackApiUrl: process.env.SLACK_API_URL || undefined,
    });
    this.channelId = process.env.SLACK_SUPPORT_CHANNEL_ID || "";
    this.supportRepository = new SupportRepository(db);
    if (!process.env.SLACK_SIGNING_SECRET) {
      console.warn(
        "SLACK_SIGNING_SECRET is not set: the Slack support webhook will refuse every request",
      );
    }
  }

  async handleNewConversation(userId: string, text: string, subject?: string) {
    // 1. Get user info for Slack
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .select(["firstName", "lastName", "email"])
      .executeTakeFirst();

    const userName = escapeSlackText(
      user ? `${user.firstName} ${user.lastName}` : "Unknown User",
    );
    const userEmail = escapeSlackText(user ? user.email : "Unknown Email");
    const subjectLine = subject
      ? `\n*Subject:* ${escapeSlackText(subject)}`
      : "";

    // 2. Create Slack thread (new top-level message)
    const result = await this.slackClient.chat.postMessage({
      channel: this.channelId,
      text: `New conversation from *${userName}* (${userEmail})${subjectLine}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*New Support Request*\n*User:* ${userName}\n*Email:* ${userEmail}${subjectLine}`,
          },
        },
        ...slackSections(text),
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
    const conversation =
      await this.supportRepository.getConversationById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      throw new NotFoundError("Conversation not found");
    }

    // 2. Save message to DB
    await this.supportRepository.addMessage(
      conversationId,
      userId,
      text,
      "user" as SupportSenderEnum,
    );

    const sections = slackSections(text);
    await this.slackClient.chat.postMessage({
      channel: this.channelId,
      thread_ts: conversation.slack_thread_ts,
      text: sections[0].text.text,
      blocks: sections,
    });

    // 4. Update last_message_at
    await this.supportRepository.updateConversationLastMessageAt(
      conversationId,
    );

    return { success: true };
  }

  async handleSlackReply(event: any) {
    if (event.bot_id || event.subtype === "bot_message") {
      return { success: true, ignored: true };
    }

    if (event.type !== "message") {
      return { success: true, ignored: true, reason: "Not a message" };
    }

    if (event.channel !== this.channelId) {
      console.warn(
        `Ignored a Slack message from channel ${String(event.channel).replace(/[^\w-]/g, "")}: support replies are read from the configured support channel only`,
      );
      return {
        success: true,
        ignored: true,
        reason: "Not in the support channel",
      };
    }

    if (typeof event.text !== "string" || event.text.trim() === "") {
      return { success: true, ignored: true, reason: "No text" };
    }

    const threadTs = event.thread_ts;
    if (!threadTs) {
      return { success: true, ignored: true, reason: "Not a thread reply" };
    }

    const conversation =
      await this.supportRepository.getConversationBySlackThreadTs(threadTs);
    if (!conversation) {
      return {
        success: true,
        ignored: true,
        reason: "No matching conversation found",
      };
    }

    const saved = await this.supportRepository.addSlackReply(
      conversation.id,
      conversation.user_id,
      decodeSlackText(event.text),
      typeof event.ts === "string" ? event.ts : null,
    );
    if (!saved) {
      return { success: true, ignored: true, reason: "Already delivered" };
    }

    // TODO: Send push notification to user

    return { success: true };
  }

  async getConversations(userId: string) {
    return await this.supportRepository.getConversationsByUserId(userId);
  }

  async getMessages(conversationId: string, userId: string) {
    const conversation =
      await this.supportRepository.getConversationById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      throw new NotFoundError("Conversation not found");
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
    if (!signingSecret || !/^\d+$/.test(timestamp)) {
      return false;
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (ageSeconds > SLACK_REQUEST_MAX_AGE_SECONDS) {
      return false;
    }

    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto
      .createHmac("sha256", signingSecret)
      .update(baseString)
      .digest("hex");
    const computedSignature = `v0=${hmac}`;

    const encoder = new TextEncoder();
    const sigBuffer = encoder.encode(signature);
    const compBuffer = encoder.encode(computedSignature);

    if (sigBuffer.length !== compBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, compBuffer);
  }
}

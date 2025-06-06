import StatusEnum from "database/src/models/public/StatusEnum";
import type { db } from "../../shared/shared.plugin";
import type { BookDto } from "../dto/book/book.dto";
import type { AddMessageDto } from "../dto/chat/add-message.dto";
import type { ChatDto } from "../dto/chat/chat.dto";
import type { NewChatDto } from "../dto/chat/new-chat.dto";
import type { RawChatHistoryDto } from "../dto/chat/raw-chat-history.dto";
import type { UserDto } from "../dto/user/user.dto";

export class ChatRepository {
  constructor(private readonly db: db) {}

  async createNewChat({
    user_id,
    title,
    chapter_id,
  }: Pick<NewChatDto, "user_id" | "title" | "chapter_id">) {
    const newChat = await this.db
      .getOrCreateConnection()
      .insertInto("conversations")
      .values({
        user_id,
        title,
        chapter_id,
        status: StatusEnum.active,
      })
      .returning(["conversation_id"])
      .executeTakeFirst();

    return {
      chat_id: newChat?.conversation_id,
    };
  }

  async checkIfChatExists({
    user_id,
    chapter_number,
    book_id,
  }: Pick<ChatDto & BookDto, "user_id" | "chapter_number" | "book_id">) {
    const chatExists = await this.db
      .getOrCreateConnection()
      .selectFrom("conversations")
      .leftJoin("chapters", "chapters.chapter_id", "conversations.chapter_id")
      .where((eb) =>
        eb.and([
          eb("conversations.user_id", "=", user_id),
          eb("chapters.chapter_number", "=", chapter_number),
          eb("chapters.book_id", "=", book_id),
        ]),
      )
      .select(["conversations.conversation_id"])
      .execute();

    return { chatExists: chatExists ?? null };
  }

  async addMessageToChat({ chat_id, content, role }: AddMessageDto) {
    const addnewMessage = await this.db
      .getOrCreateConnection()
      .insertInto("messages")
      .values({
        conversation_id: chat_id,
        content,
        role,
      })
      .returning(["message_id"])
      .executeTakeFirst();

    return { newMessage: addnewMessage };
  }

  async updateChatDate({
    conversation_id: chat_id,
    updated_at,
  }: Pick<ChatDto, "conversation_id" | "updated_at">) {
    const updateChatDate = await this.db
      .getOrCreateConnection()
      .updateTable("conversations")
      .set({
        updated_at: updated_at,
      })
      .where("conversation_id", "=", chat_id)
      .execute();
  }

  async getUserChatHistory({
    id: user_id,
  }: Pick<UserDto, "id">): Promise<{ rawChatHistory: RawChatHistoryDto[] }> {
    const rawChatHistory = await this.db
      .getOrCreateConnection()
      .selectFrom("conversations")
      .leftJoin(
        "messages",
        "messages.conversation_id",
        "conversations.conversation_id",
      )
      .leftJoin("chapters", "chapters.chapter_id", "conversations.chapter_id")
      .leftJoin("books", "books.book_id", "chapters.book_id")
      .where("conversations.user_id", "=", user_id)
      .where("conversations.status", "=", StatusEnum.active)
      .select([
        "conversations.conversation_id",
        "conversations.user_id",
        "conversations.title",
        "conversations.status",
        "conversations.updated_at",
        "messages.message_id",
        "messages.content",
        "messages.role",
        "chapters.chapter_number",
        "books.book_id",
        "books.name as bookName",
        "books.testament as bookTestament",
        "books.genre_id as genreId",
      ])
      .orderBy("conversations.updated_at", "desc")
      .execute();

    typeof rawChatHistory;

    return { rawChatHistory: rawChatHistory };
  }

  async getUserChatMessageHistory({
    user_id,
    conversation_id,
  }: Pick<ChatDto, "user_id" | "conversation_id">): Promise<{
    chatMessageHistory: RawChatHistoryDto[];
  }> {
    const chatMessageHistory = await this.db
      .getOrCreateConnection()
      .selectFrom("conversations")
      .leftJoin(
        "messages",
        "messages.conversation_id",
        "conversations.conversation_id",
      )
      .leftJoin("chapters", "chapters.chapter_id", "conversations.chapter_id")
      .leftJoin("books", "books.book_id", "chapters.book_id")
      .where("conversations.user_id", "=", user_id)
      .where("conversations.conversation_id", "=", conversation_id)
      .where("messages.conversation_id", "=", conversation_id)
      .select([
        "conversations.conversation_id",
        "conversations.user_id",
        "conversations.title",
        "conversations.status",
        "conversations.updated_at",
        "messages.message_id",
        "messages.content",
        "messages.role",
        "chapters.chapter_number",
        "books.book_id",
        "books.name as bookName",
        "books.testament as bookTestament",
        "books.genre_id as genreId",
      ])
      .execute();

    return { chatMessageHistory };
  }

  async disableChat({
    conversation_id,
  }: Pick<ChatDto, "conversation_id">): Promise<{
    chat_id: number | undefined;
  }> {
    const updateChatStatus = await this.db
      .getOrCreateConnection()
      .updateTable("conversations")
      .where("conversation_id", "=", conversation_id)
      .set({
        status: StatusEnum.inactive,
      })
      .returning(["conversation_id"])
      .executeTakeFirst();

    return { chat_id: updateChatStatus?.conversation_id };
  }
}

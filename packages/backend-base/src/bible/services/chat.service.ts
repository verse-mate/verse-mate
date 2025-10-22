import type RoleEnum from "database/src/models/public/RoleEnum";
import type { AddMessageDto } from "../dto/chat/add-message.dto";
import type { ChatEntity } from "../dto/chat/chat.dto";
import type { GroupedChatHistoryDto } from "../dto/chat/grouped-chat-history.dto";
import type { NewChatDto } from "../dto/chat/new-chat.dto";
import type { RawChatHistoryEntity } from "../dto/chat/raw-chat-history.dto";
import type { UserDto } from "../dto/user/user.dto";
import type { BibleRepository } from "../repository/bible.repository";
import type { ChatRepository } from "../repository/chat.repository";
import { ChatHistoryGrouper } from "../utils/chat-history-grouper";
import { currentDate } from "../utils/custom-date";

export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly bibleRepository: BibleRepository,
  ) {}

  async createNewChat({
    user_id,
    title,
    book_id,
    chapter_number,
  }: Pick<NewChatDto, "book_id" | "chapter_number" | "user_id" | "title">) {
    const { book } = await this.bibleRepository.getBook({ book_id });
    if (!book) return { message: "Book not found" };

    const { chapter } = await this.bibleRepository.getChapter({
      book_id,
      chapter_number,
    });
    if (!chapter) return { message: "Chapter not found" };

    const { chat_id } = await this.chatRepository.createNewChat({
      user_id,
      title,
      chapter_id: chapter.chapter_id,
    });
    return { chat_id: chat_id, message: "Chat created" };
  }

  async checkIfChatExists({
    user_id,
    chapter_number,
    book_id,
  }: { user_id: string; chapter_number: number; book_id: number }) {
    const { chatExists } = await this.chatRepository.checkIfChatExists({
      user_id,
      book_id,
      chapter_number,
    });
    return { chatExists };
  }

  async addMessageToChat({ chat_id, content, role }: AddMessageDto) {
    const { newMessage } = await this.chatRepository.addMessageToChat({
      chat_id,
      content,
      role,
    });

    await this.chatRepository.updateChatDate({
      conversation_id: chat_id,
      updated_at: currentDate().toISOString(),
    });

    return { newMessage };
  }

  async getUserChatHistory({
    id: user_id,
  }: Pick<UserDto, "id">): Promise<GroupedChatHistoryDto> {
    const { rawChatHistory } = await this.chatRepository.getUserChatHistory({
      id: user_id,
    });

    const formattedChat = this.formatChatHistory(rawChatHistory);

    const periods = [
      { label: "today", daysAgo: 0 },
      { label: "yesterday", daysAgo: 1 },
      { label: "lastSevenDays", daysAgo: 7 },
    ];

    const grouper = new ChatHistoryGrouper(periods);

    return grouper.group(formattedChat);
  }

  async getUserChatMessageHistory({
    user_id,
    conversation_id,
  }: Pick<ChatEntity, "user_id" | "conversation_id">) {
    const { chatMessageHistory } =
      await this.chatRepository.getUserChatMessageHistory({
        user_id,
        conversation_id,
      });
    return chatMessageHistory;
  }

  async disableChat({
    conversation_id,
  }: Pick<ChatEntity, "conversation_id">): Promise<{
    chat_id: number | undefined;
  }> {
    const { chat_id } = await this.chatRepository.disableChat({
      conversation_id,
    });
    return { chat_id };
  }

  private formatChatHistory(
    rawChatHistory: RawChatHistoryEntity[],
  ): ChatEntity[] {
    const formattedChatHistory: ChatEntity[] = rawChatHistory.reduce(
      (formattedChats, rawChatRow) => {
        let chat = formattedChats.find(
          (chat) => chat.conversation_id === rawChatRow.conversation_id,
        );

        if (!chat) {
          const updatedAt = rawChatRow.updated_at as Date;
          chat = {
            conversation_id: rawChatRow.conversation_id,
            title: rawChatRow.title,
            user_id: rawChatRow.user_id,
            status: rawChatRow.status,
            // Serialize Date to ISO string for API response
            updated_at: updatedAt?.toISOString() || new Date().toISOString(),
            book: {
              book_id: rawChatRow.book_id,
              name: rawChatRow.bookName,
              testament: rawChatRow.bookTestament,
              genre_id: rawChatRow.genreId,
            },
            chapter_number: rawChatRow.chapter_number,
            messages: [],
          };
          formattedChats.push(chat);
        }
        if (rawChatRow.message_id) {
          chat.messages.push({
            message_id: rawChatRow.message_id,
            content: rawChatRow.content as string,
            role: rawChatRow.role as RoleEnum,
          });
        }

        return formattedChats;
      },
      [] as ChatEntity[],
    );
    return formattedChatHistory;
  }
}

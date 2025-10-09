import { startOfDay, subDays } from "date-fns";
import type { ChatEntity } from "../dto/chat/chat.dto";
import type { GroupedChatHistoryDto } from "../dto/chat/grouped-chat-history.dto";

interface Period {
  label: string;
  daysAgo: number;
}

export class ChatHistoryGrouper {
  private periods: Period[];

  constructor(periods: Period[]) {
    this.periods = periods;
  }

  group(chatHistory: ChatEntity[]): GroupedChatHistoryDto {
    const today = startOfDay(new Date());
    const periodDates = this.periods.map((period) => ({
      label: period.label,
      date: subDays(today, period.daysAgo),
    }));

    const groupedHistory: GroupedChatHistoryDto = {};

    chatHistory.forEach((chat) => {
      const updatedAtDate = new Date(chat.updated_at);
      for (const period of periodDates) {
        if (updatedAtDate >= period.date) {
          if (!groupedHistory[period.label]) {
            groupedHistory[period.label] = [];
          }
          groupedHistory[period.label].push(chat);
          break;
        }
      }
    });
    return groupedHistory;
  }
}

import * as RadixTabs from "@radix-ui/react-tabs";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type RoleEnum from "database/src/models/public/RoleEnum";
import type StatusEnum from "database/src/models/public/StatusEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { UserSession } from "../../../hooks/session";
import { History } from "../../../ui/ConversationHistory";
import { Chat } from "../../Chat";
import { Explanation } from "../../Explanation";
import { ProfileButton } from "../../Header/UserProfile/user-profile";
import { LoginCard } from "../../LoginCard";
import styles from "./content.module.css";

type Props = {
  session: UserSession | null;
  explanation:
    | {
        book_id?: number;
        chapter_number?: number;
        explanation: string | null;
        type?: ExplanationTypeEnum | null;
        explanation_id?: number | null;
      }
    | null
    | undefined;
  conversationsHistory:
    | never[]
    | {
        [x: string]: {
          title: string;
          conversation_id: number;
          chapter_number: number | null;
          messages: {
            role: RoleEnum;
            content: string;
            message_id: number;
          }[];
          book: {
            book_id: number | null;
            testament: TestamentEnum | null;
            name: string | null;
            genre_id: number | null;
          };
          user_id: string;
          status: StatusEnum;
          updated_at: Date;
        }[];
      }
    | undefined;
  selectConversation: ({
    conversationId,
    bookId,
    verseId,
    testament,
  }: {
    conversationId: string;
    bookId: string;
    verseId: string;
    testament: TestamentEnum;
  }) => void;
  askVerseMate: boolean;
};

export const Content = ({
  session,
  conversationsHistory,
  selectConversation,
  askVerseMate,
}: Props) => {
  return (
    <>
      <RadixTabs.Content className={styles.content} value="explanation">
        <Explanation.Container>
          <Explanation.Content />
        </Explanation.Container>
      </RadixTabs.Content>

      {askVerseMate && (
        <>
          <RadixTabs.Content className={styles.content} value="chat">
            {session?.id ? (
              <Chat.Card>
                <Chat.CardContent />
              </Chat.Card>
            ) : (
              <LoginCard.Root>
                <LoginCard.Content />
              </LoginCard.Root>
            )}
          </RadixTabs.Content>

          <RadixTabs.Content className={styles.content} value="newChat">
            {session?.id ? (
              <Chat.Card>
                <Chat.CardContent />
              </Chat.Card>
            ) : (
              <LoginCard.Root>
                <LoginCard.Content />
              </LoginCard.Root>
            )}
          </RadixTabs.Content>

          <RadixTabs.Content className={styles.content} value="chatHistory">
            {session?.id ? (
              <div className={styles.historyContainer}>
                <History.Root>
                  <History.Content>
                    {!conversationsHistory ||
                    Object.keys(conversationsHistory).length === 0 ? (
                      <span>no chats</span>
                    ) : (
                      Object.entries(conversationsHistory).map(
                        ([key, conversation]) => (
                          <div key={key} className={styles.groupContainer}>
                            <History.HistoryLabel date={key} />
                            {conversation.map((data) => (
                              <History.HistoryButton
                                key={data.conversation_id}
                                onClick={() =>
                                  selectConversation({
                                    bookId: String(data.book.book_id),
                                    verseId: String(data.chapter_number),
                                    conversationId: String(
                                      data.conversation_id,
                                    ),
                                    testament: data.book
                                      .testament as TestamentEnum,
                                  })
                                }
                                label={
                                  data.messages && data.messages.length > 0
                                    ? data.messages[data.messages.length - 1]
                                        .content
                                    : "No messages"
                                }
                                title={data.title}
                                conversation_id={data.conversation_id}
                              />
                            ))}
                          </div>
                        ),
                      )
                    )}
                  </History.Content>
                </History.Root>
              </div>
            ) : (
              <LoginCard.Root>
                <LoginCard.Content />
              </LoginCard.Root>
            )}
          </RadixTabs.Content>
        </>
      )}

      <RadixTabs.Content className={styles.content} value="menu">
        <div className={styles.moreOptionsContainer}>
          {session?.id ? (
            <ProfileButton link="/" />
          ) : (
            <LoginCard.Root>
              <LoginCard.Content />
            </LoginCard.Root>
          )}
        </div>
      </RadixTabs.Content>
    </>
  );
};

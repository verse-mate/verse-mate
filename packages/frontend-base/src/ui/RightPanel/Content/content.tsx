import * as RadixTabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type RoleEnum from "database/src/models/public/RoleEnum";
import type StatusEnum from "database/src/models/public/StatusEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { getTopicDetails } from "../../../api/topics";
import { SignIn } from "../../../auth/SignIn";
import { SignUp } from "../../../auth/SignUp";
import type { UserSession } from "../../../hooks/session";
import { useGetSearchParams } from "../../../hooks/useSearchParams";
import { History } from "../../../ui/ConversationHistory";
import { homeOptions } from "../../../utils/home-options";
import { Accordion } from "../../Accordion";
import { Chat } from "../../Chat";
import { Explanation } from "../../Explanation";
import explanationStyles from "../../Explanation/explanation.module.css";
import { ProfileButton } from "../../Header/UserProfile/user-profile";
import * as Icon from "../../Icons";
import { LoginCard } from "../../LoginCard";
import { Settings } from "../../Settings/Settings";
import styles from "./content.module.css";

import type { useSwipeable } from "react-swipeable";

type Props = {
  isViewingTopic: boolean;
  topicId?: string;
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
        today: {
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
          updated_at: string;
        }[];
        yesterday: {
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
          updated_at: string;
        }[];
        lastSevenDays: {
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
          updated_at: string;
        }[];
        older: {
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
          updated_at: string;
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
  rightPanelContent: string;
  setRightPanelContent: (value: string) => void;
  selectedBibleVersion: string;
  handleBibleVersionSelected: (version: string) => void;
  handleDesktopSwipe: ReturnType<typeof useSwipeable>;
};

export const Content = ({
  isViewingTopic,
  topicId,
  session,
  explanation,
  conversationsHistory,
  selectConversation,
  askVerseMate,
  rightPanelContent,
  setRightPanelContent,
  selectedBibleVersion,
  handleBibleVersionSelected,
  handleDesktopSwipe,
}: Props) => {
  const { explanationType } = useGetSearchParams();

  const { data: topicDetails } = useQuery({
    queryKey: ["topic-details-explanation", topicId, selectedBibleVersion],
    queryFn: () => getTopicDetails(topicId, selectedBibleVersion),
    enabled: isViewingTopic && !!topicId,
  });

  const topicExplanation = isViewingTopic
    ? {
        explanation:
          topicDetails?.explanation?.[explanationType || "summary"] ||
          "**Topic Explanation Coming Soon**...",
        explanation_id: `topic-${topicId}`,
      }
    : explanation;

  return (
    <>
      <RadixTabs.Content className={styles.content} value="explanation">
        <div
          {...handleDesktopSwipe}
          className={explanationStyles.explanationContent}
        >
          <Explanation.DesktopContainer>
            <Explanation.Content explanation={topicExplanation} />
          </Explanation.DesktopContainer>
        </div>
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
                <LoginCard.Content
                  setRightPanelContent={setRightPanelContent}
                />
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
                <LoginCard.Content
                  setRightPanelContent={setRightPanelContent}
                />
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
                <LoginCard.Content
                  setRightPanelContent={setRightPanelContent}
                />
              </LoginCard.Root>
            )}
          </RadixTabs.Content>
        </>
      )}

      <RadixTabs.Content className={styles.content} value="menu">
        <div
          className={`${styles.moreOptionsContainer} ${!session?.id && styles.noPadding}`}
        >
          {session?.id ? (
            rightPanelContent === "settings" ? (
              <Settings
                selectedBibleVersion={selectedBibleVersion}
                setSelectedBibleVersion={handleBibleVersionSelected}
                setRightPanelContent={setRightPanelContent}
              />
            ) : (
              <>
                <ProfileButton setRightPanelContent={setRightPanelContent} />
                <div className={styles.menuOptions}>
                  <Accordion.Root type="multiple">
                    {homeOptions.map((option) => (
                      <Accordion.Item key={option.name} value={option.name}>
                        <Accordion.Trigger
                          label={option.label}
                          icon={option.icon}
                        />
                        <Accordion.Content>{option.content}</Accordion.Content>
                      </Accordion.Item>
                    ))}
                  </Accordion.Root>
                  <Accordion.Root type="multiple">
                    <Accordion.Item value="settings">
                      <div
                        onClick={() => setRightPanelContent("settings")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setRightPanelContent("settings");
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <Accordion.Trigger
                          label="Settings"
                          icon={<Icon.SettingsIcon />}
                        />
                      </div>
                    </Accordion.Item>
                  </Accordion.Root>
                </div>
              </>
            )
          ) : (
            <>
              {rightPanelContent === "login" && (
                <SignIn onSwitch={() => setRightPanelContent("signup")} />
              )}
              {rightPanelContent === "signup" && (
                <SignUp onSwitch={() => setRightPanelContent("login")} />
              )}
              {rightPanelContent === "default" && (
                <LoginCard.Root>
                  <LoginCard.Content
                    setRightPanelContent={setRightPanelContent}
                  />
                </LoginCard.Root>
              )}
            </>
          )}
        </div>
      </RadixTabs.Content>
    </>
  );
};

import * as RadixTabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { getTopicDetails } from "../../../api/topics";
import { SignIn } from "../../../auth/SignIn";
import { SignUp } from "../../../auth/SignUp";
import type { UserSession } from "../../../hooks/session";
import { useGetSearchParams } from "../../../hooks/useSearchParams";
import { homeOptions } from "../../../utils/home-options";
import { Accordion } from "../../Accordion";
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
  // Q&A props (conversationsHistory, selectConversation, askVerseMate) removed per D-009
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

      {/* Q&A chat + chat-history tabs removed per D-009 — feature dropped. */}

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

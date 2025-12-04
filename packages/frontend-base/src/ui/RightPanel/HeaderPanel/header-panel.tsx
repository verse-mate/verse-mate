import * as RadixTabs from "@radix-ui/react-tabs";
import { useQueryClient } from "@tanstack/react-query";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../../hooks/useSearchParams";
import { explanationTypes } from "../../../utils/commentary-options";
import * as Icon from "../../Icons";
import styles from "./header-panel.module.css";

type Props = {
  activeTab: string;
  setActiveTab: (value: string) => void;
  setRightPanelContent: (value: string) => void;
};

export const Nav = ({
  activeTab,
  setActiveTab,
  setRightPanelContent,
}: Props) => {
  const queryClient = useQueryClient();
  const { explanationType } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const handleValueChange = (value: ExplanationTypeEnum) => {
    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  return (
    <RadixTabs.List className={styles.listWrapper}>
      {/* <div className={styles.explanationAndChatButton}>
        <RadixTabs.Trigger className={`${styles.trigger}`} value="explanation">
          <OpenedBook className={` ${styles.active}`} />
        </RadixTabs.Trigger>
        {askVerseMate && (
          <RadixTabs.Trigger className={styles.trigger} value="chat">
            <Icon.ChatIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
        )}
      </div> */}
      {activeTab !== "chat" &&
        activeTab !== "newChat" &&
        activeTab !== "chatHistory" &&
        activeTab !== "menu" && (
          <div
            className={styles.explanationTypesButton}
            data-tour="explanation-types-desktop"
          >
            {explanationTypes.map((option, index) => (
              <button
                className={`${styles.trigger} ${styles.active}`}
                value={`tab${index + 3}`}
                type="button"
                key={option.value}
                style={{
                  borderRadius: "100px",
                  padding: "2px 8px",
                  backgroundColor:
                    option.value === explanationType
                      ? "var(--dust)"
                      : "#FFFFFF33",
                  color:
                    option.value === explanationType
                      ? "var(--night)"
                      : "var(--snow)",
                  fontFamily: "Inter",
                  fontSize: "14px",
                  fontWeight: "500",
                  lineHeight: "24px",
                }}
                onClick={() =>
                  handleValueChange(option.value as ExplanationTypeEnum)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

      {(activeTab === "chat" ||
        activeTab === "newChat" ||
        activeTab === "chatHistory") && (
        <div className={styles.askVerseMateText}>
          <p>Ask VerseMate</p>
        </div>
      )}

      <div className={styles.moreOptionButton}>
        {(activeTab === "chat" ||
          activeTab === "newChat" ||
          activeTab === "chatHistory") && (
          <>
            <RadixTabs.Trigger
              className={styles.trigger}
              value="newChat"
              onClick={() => saveSearchParams({ conversationId: "newChat" })}
            >
              <Icon.PencilSquareIcon className={` ${styles.active}`} />
            </RadixTabs.Trigger>
            <RadixTabs.Trigger className={styles.trigger} value="chatHistory">
              <Icon.HistoryIcon className={` ${styles.active}`} />
            </RadixTabs.Trigger>
          </>
        )}

        <button
          type="button"
          className={styles.trigger}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetTab = activeTab === "menu" ? "explanation" : "menu";
            setActiveTab(targetTab);
            setRightPanelContent("default");
          }}
          style={{ position: "relative", zIndex: 9999 }}
          data-tour="menu-button-desktop"
        >
          <Icon.AnimatedHamburgerIcon
            isOpen={activeTab === "menu"}
            className={`${styles.active}`}
            style={{ fill: "white" }}
          />
        </button>
      </div>
    </RadixTabs.List>
  );
};

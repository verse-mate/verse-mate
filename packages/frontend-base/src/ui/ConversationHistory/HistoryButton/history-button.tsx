/**
 * @deprecated D-009 + D-014 — Q&A feature removed; frontend-next is admin-only.
 *
 * This file is part of the user-facing Bible reader Chat / Q&A flow that has
 * been deprecated per Phase 1 decision D-009 (Q&A removed entirely) AND
 * Epic 12 (frontend-next scoped to admin-only).
 *
 * Removal is pending — companion PR to "feat: drop Q&A entirely" (#204) will
 * delete this file along with the Chat UI and migrate consumers in
 * main-content.tsx, RightPanel, Header.
 *
 * Do NOT add new code here; do NOT add new callers.
 */

import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../../hooks/useSearchParams";
import { chatActions } from "../../../utils/chat-actions";
import { ThreeDotsIcon } from "../../Icons";
import { Popover } from "../../Popover";
import styles from "./history-button.module.css";

type HistoryButtonProps = {
  label: string;
  title: string | null;
  conversation_id: number | null;
  onClick?: () => void;
};

export const HistoryButton = ({
  conversation_id,
  label,
  title,
  onClick,
  ...rest
}: HistoryButtonProps) => {
  const queryClient = useQueryClient();
  const { conversationId } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  const selectedChat = conversationId === String(conversation_id);

  const deleteChat = async (conversation_id: string) => {
    const responseDeleteChat = await api.bible.book["delete-chat"]({
      conversation_id,
    })
      .delete()
      .then((response) => response.data?.disabledChat);
    if (responseDeleteChat) {
      saveSearchParams({ conversationId: "newChat" });
      queryClient.invalidateQueries({
        queryKey: ["conversationMessages"],
      });
      queryClient.invalidateQueries({
        queryKey: ["conversationsHistory"],
      });
    }
  };

  const handleActionClick = (actionName: string) => {
    const actions: { [key: string]: () => void } = {
      delete: () => {
        if (conversation_id !== null) {
          deleteChat(String(conversation_id));
        }
      },
      archive: () => {
        if (conversation_id !== null) {
          // Implement archive functionality
          // console.log("archived");
        }
      },
    };

    const action = actions[actionName];
    if (action) {
      action();
    }
  };

  return (
    <div
      className={`${styles.container} ${selectedChat ? styles.selectedChat : ""}`}
      {...rest}
    >
      <div className={`${styles.content}`}>
        <button
          type="button"
          onClick={onClick}
          className={`${styles.mainButton}`}
          title={title || ""}
        >
          <span className={`${styles.truncate}`}>{title}</span>
        </button>
        <div className={`${styles.menuWrapper} ${styles.menuOpen}`}>
          <Popover.Root>
            <Popover.Trigger className={`${styles.threeDotsIcon}`}>
              <ThreeDotsIcon />
            </Popover.Trigger>
            <div
              style={{
                zIndex: "99999",
                position: "relative",
              }}
            >
              <Popover.Content sideOffset={10} side="bottom">
                <Popover.ListItem>
                  {chatActions.map((action) => (
                    <Popover.Item
                      key={action.name}
                      icon={action.icon}
                      label={action.label}
                      onClick={() => handleActionClick(action.name)}
                    />
                  ))}
                </Popover.ListItem>
              </Popover.Content>
            </div>
          </Popover.Root>
        </div>
      </div>
    </div>
  );
};

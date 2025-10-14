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

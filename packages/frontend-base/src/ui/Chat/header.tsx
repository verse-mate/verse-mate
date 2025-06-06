import * as RadixTabs from "@radix-ui/react-tabs";
import { useSaveSearchParams } from "../../hooks/useSearchParams";
import * as Icon from "../Icons";
import styles from "./chat.module.css";

export const ChatHeader = () => {
  const { saveSearchParams } = useSaveSearchParams();

  return (
    <>
      <div className={`${styles.separator}`} />
      <div className={`${styles.subHeader}`}>
        <RadixTabs.List className={`${styles.flexBetween}`}>
          <RadixTabs.Trigger
            className={styles.trigger}
            value="newChat"
            onClick={() => saveSearchParams({ conversationId: "newChat" })}
          >
            <Icon.PencilSquareIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
          <div className={styles.title}>
            <p>Ask VerseMate</p>
          </div>
          <RadixTabs.Trigger className={styles.trigger} value="chatHistory">
            <Icon.HistoryIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
        </RadixTabs.List>
      </div>
    </>
  );
};

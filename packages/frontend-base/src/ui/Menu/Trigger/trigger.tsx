import { TuneIcon } from "../../Icons";
import styles from "./trigger.module.css";

type TriggerProps = {
  icon?: React.ReactNode;
  isOpened: boolean;
  toggleSidebar: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
};

export const Trigger = ({
  icon,
  isOpened,
  toggleSidebar,
  buttonRef,
}: TriggerProps) => {
  return (
    <button
      ref={buttonRef}
      onClick={toggleSidebar}
      type="button"
      className={styles.button}
    >
      {icon ?? (
        <TuneIcon
          className={`${styles.icon} ${isOpened ? styles.opened : styles.closed}`}
        />
      )}
    </button>
  );
};

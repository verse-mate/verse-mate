import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "../../Icons";
import styles from "./trigger.module.css";

type TriggerProps = {
  selectedVersion: string;
};

export const Trigger = ({ selectedVersion }: TriggerProps) => {
  return (
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Customise options"
      >
        <span className={styles.truncate}>{selectedVersion}</span>
        <span>
          <ChevronDownIcon />
        </span>
      </button>
    </DropdownMenu.Trigger>
  );
};

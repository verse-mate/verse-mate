import * as RadixSelect from "@radix-ui/react-select";
import { toCapitalize } from "../../../utils/text-transform";
import styles from "./trigger.module.css";

type TriggerProps = {
  selectedBook: string | null;
  selectedVerse: string | null;
  icon: React.ReactNode;
  defaultPlaceholder: string;
};

export const Trigger = ({
  selectedBook,
  selectedVerse,
  icon,
  defaultPlaceholder,
}: TriggerProps) => {
  const placeholder = toCapitalize(
    `${selectedBook || defaultPlaceholder} ${selectedVerse || ""}`,
  );

  return (
    <RadixSelect.Trigger className={styles.trigger}>
      <span className={styles.truncate}>
        <RadixSelect.Value placeholder={placeholder} />
      </span>
      <span className={styles.trigger}>
        <RadixSelect.Icon>{icon}</RadixSelect.Icon>
      </span>
    </RadixSelect.Trigger>
  );
};

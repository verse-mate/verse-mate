import * as RadixTabs from "@radix-ui/react-tabs";
import { useCallback } from "react";
import styles from "./trigger.module.css";

type TriggerProps = {
  value: string;
  label: string;
  resetFilter?: () => void;
};

export const Trigger = ({ value, label, resetFilter }: TriggerProps) => {
  const handleClick = useCallback(() => {
    if (resetFilter) {
      resetFilter();
    }
  }, [resetFilter]);

  return (
    <RadixTabs.Trigger
      value={value}
      className={styles.tab}
      onClick={handleClick}
    >
      {label}
    </RadixTabs.Trigger>
  );
};

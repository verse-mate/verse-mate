import * as RadixTabs from "@radix-ui/react-tabs";
import { useCallback } from "react";
import styles from "./trigger.module.css";

type TriggerProps = {
  value: string;
  label: string;
  resetFilter?: () => void;
  dataTour?: string;
};

export const Trigger = ({
  value,
  label,
  resetFilter,
  dataTour,
}: TriggerProps) => {
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
      data-tour={dataTour}
    >
      {label}
    </RadixTabs.Trigger>
  );
};

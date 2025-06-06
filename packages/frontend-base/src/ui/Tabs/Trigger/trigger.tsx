import * as RadixTabs from "@radix-ui/react-tabs";
import styles from "./trigger.module.css";

type TriggerProps = {
  value: string;
  label: string;
};

export const Trigger = ({ value, label }: TriggerProps) => {
  return (
    <RadixTabs.Trigger value={value} className={styles.tab}>
      {label}
    </RadixTabs.Trigger>
  );
};

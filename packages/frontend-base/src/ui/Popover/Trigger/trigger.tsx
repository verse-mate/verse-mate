import * as RadixPopover from "@radix-ui/react-popover";
import styles from "./trigger.module.css";

type TriggerProps = {
  children: React.ReactNode;
  className?: string;
};

export const Trigger = ({ children, className }: TriggerProps) => {
  return (
    <RadixPopover.Trigger asChild className={className}>
      <button type="button" className={styles.button}>
        {children}
      </button>
    </RadixPopover.Trigger>
  );
};

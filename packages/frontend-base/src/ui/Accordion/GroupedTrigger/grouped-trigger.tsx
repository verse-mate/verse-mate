import * as RadixAccordion from "@radix-ui/react-accordion";
import { forwardRef } from "react";
import { ChevronRightIcon } from "../../Icons";
import styles from "./grouped-trigger.module.css";

type TriggerProps = {
  description?: string;
  selectedContent: string;
  disabled?: boolean;
};

export const GroupedTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ description, selectedContent, disabled = false }, ref) => {
    return (
      <RadixAccordion.Trigger
        ref={ref}
        className={`${styles.trigger} accordionTrigger`}
        disabled={disabled}
        style={disabled ? { pointerEvents: "none", cursor: "default" } : {}}
      >
        <div className={styles.content}>
          <span className={styles.description}>{description}</span>
          <span className={styles.selectedContent}>{selectedContent}</span>
        </div>
        <ChevronRightIcon className={styles.accordionChevron} />
      </RadixAccordion.Trigger>
    );
  },
);

GroupedTrigger.displayName = "GroupedTrigger";

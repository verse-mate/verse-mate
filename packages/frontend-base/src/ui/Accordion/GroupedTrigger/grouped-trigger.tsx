import * as RadixAccordion from "@radix-ui/react-accordion";
import { ChevronRightIcon } from "../../Icons";
import styles from "./grouped-trigger.module.css";

type TriggerProps = {
  description?: string;
  selectedContent: string;
};

export const GroupedTrigger = ({
  description,
  selectedContent,
}: TriggerProps) => {
  return (
    <RadixAccordion.Trigger className={`${styles.trigger} accordionTrigger`}>
      <div className={styles.content}>
        <span className={styles.description}>{description}</span>
        <span className={styles.selectedContent}>{selectedContent}</span>
      </div>
      <ChevronRightIcon className={styles.accordionChevron} />
    </RadixAccordion.Trigger>
  );
};

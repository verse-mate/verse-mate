import * as RadixAccordion from "@radix-ui/react-accordion";
import { CheckIcon } from "../../Icons";
import styles from "./trigger.module.css";

type TriggerProps = {
  label: string;
  icon?: React.ReactNode;
  highlightBook?: boolean;
};

const getTriggerStyles = (hightlightBook?: boolean) => {
  if (hightlightBook) {
    return {
      backgroundColor: "var(--dust)",
      color: "var(--snow)",
    };
  }
  return {};
};

const getSpanStyles = (hightlightBook?: boolean) => {
  if (hightlightBook) {
    return {
      backgroundColor: "var(--dust)",
      color: "var(--snow)",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    };
  }
  return {};
};

const getSvgStyles = (hightlightBook?: boolean) => {
  if (hightlightBook) {
    return {
      fill: "var(--snow)",
    };
  }
  return {};
};

export const Trigger = ({ highlightBook, label, icon }: TriggerProps) => {
  return (
    <RadixAccordion.Trigger
      className={`${styles.trigger} ${highlightBook ? styles.fixedItem : ""}`}
      style={getTriggerStyles(highlightBook)}
    >
      {icon && icon}
      <span style={getSpanStyles(highlightBook)}>
        {label}
        {highlightBook && <CheckIcon style={getSvgStyles(highlightBook)} />}
      </span>
    </RadixAccordion.Trigger>
  );
};

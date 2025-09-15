import * as RadixAccordion from "@radix-ui/react-accordion";
import { CheckIcon } from "../../Icons";
import styles from "./trigger.module.css";

type TriggerProps = {
  label: string;
  icon?: React.ReactNode;
  highlightBook?: boolean;
  iconPosition?: "left" | "right";
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

const getSpanStyles = (
  hightlightBook?: boolean,
  iconPosition?: "left" | "right",
) => {
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
  // Only use flex layout when we have an icon positioned on the right
  if (iconPosition === "right") {
    return {
      width: "100%",
      display: "flex",
      alignItems: "center",
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

export const Trigger = ({
  highlightBook,
  label,
  icon,
  iconPosition = "left",
}: TriggerProps) => {
  return (
    <RadixAccordion.Trigger
      className={`${styles.trigger} ${highlightBook ? styles.fixedItem : ""}`}
      style={getTriggerStyles(highlightBook)}
    >
      {icon && iconPosition === "left" && icon}
      <span style={getSpanStyles(highlightBook, iconPosition)}>
        {label}
        {highlightBook && <CheckIcon style={getSvgStyles(highlightBook)} />}
        {icon && iconPosition === "right" && (
          <span style={{ marginLeft: "auto" }}>{icon}</span>
        )}
      </span>
    </RadixAccordion.Trigger>
  );
};

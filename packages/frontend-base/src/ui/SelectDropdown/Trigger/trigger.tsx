import * as RadixSelect from "@radix-ui/react-select";
import { toCapitalize } from "../../../utils/text-transform";
import styles from "./trigger.module.css";

type TriggerProps = {
  selectedBook: string | null;
  selectedVerse: string | null;
  icon: React.ReactNode;
  defaultPlaceholder: string;
  disabled?: boolean;
  onClick?: () => void;
  theme?: "dark" | "light"; // Theme variant for consistent styling
  className?: string; // Additional className for custom styling
  context?: "bible-selection" | "settings" | "general"; // New context prop for visibility control
  expandText?: boolean; // New text expansion control
};

export const Trigger = ({
  selectedBook,
  selectedVerse,
  icon,
  defaultPlaceholder,
  disabled,
  onClick,
  theme = "dark", // Default to dark theme for backward compatibility
  className,
  context = "general", // Default to general context for backward compatibility
  expandText = false, // Default to false for backward compatibility
}: TriggerProps) => {
  const placeholder = toCapitalize(
    `${selectedBook || defaultPlaceholder} ${selectedVerse || ""}`,
  );

  // Apply theme-specific class through data attribute for CSS targeting
  const triggerClassName = className
    ? `${styles.trigger} ${className}`
    : styles.trigger;

  return (
    <RadixSelect.Trigger
      className={triggerClassName}
      disabled={disabled}
      onClick={onClick}
      data-theme={theme} // Use data attribute for theme targeting
      data-context={context} // Use data attribute for context targeting
      data-expand-text={expandText} // Use data attribute for text expansion control
    >
      <span className={styles.truncate}>
        <RadixSelect.Value placeholder={placeholder} />
      </span>
      <span className={styles.iconWrapper}>
        <RadixSelect.Icon>{icon}</RadixSelect.Icon>
      </span>
    </RadixSelect.Trigger>
  );
};

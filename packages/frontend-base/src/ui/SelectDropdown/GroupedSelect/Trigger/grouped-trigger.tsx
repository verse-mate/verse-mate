import { useEffect, useRef } from "react";
import * as Icon from "../../../Icons"; // Import icons
import styles from "./grouped-trigger.module.css";

type GroupedTriggerProps = {
  selectedBook: string | null;
  selectedVerse: string | null;
  defaultPlaceholder: string;
  isOpen: boolean;
  toggleDropdown: () => void;
  onClose: () => void;
  resetFilter: () => void;
  dataTour?: string;
};

export const GroupedTrigger = ({
  selectedBook,
  selectedVerse,
  defaultPlaceholder,
  isOpen,
  toggleDropdown,
  onClose,
  resetFilter,
  dataTour,
}: GroupedTriggerProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        if (resetFilter) {
          resetFilter();
        }
        if (onClose) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, resetFilter]);

  const displayText =
    selectedBook && selectedVerse
      ? `${selectedBook} ${selectedVerse}`
      : selectedBook || defaultPlaceholder;

  const handleToggleClick = () => {
    if (isOpen && resetFilter) {
      resetFilter();
    }
    toggleDropdown();
  };

  // Type assertion to include the new CSS classes
  const extendedStyles = styles as typeof styles & {
    text: string;
    iconWrapper: string;
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggleClick}
      className={extendedStyles.trigger}
      data-state={isOpen ? "open" : "closed"}
      data-tour={dataTour}
      data-dropdown-trigger="true"
    >
      <span className={extendedStyles.text}>{displayText}</span>
      <span className={extendedStyles.iconWrapper}>
        <Icon.ChevronDownIcon className={extendedStyles.trigger} />
      </span>
    </button>
  );
};

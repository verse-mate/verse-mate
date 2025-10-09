import { useEffect, useRef } from "react";
import styles from "./grouped-trigger.module.css";

type GroupedTriggerProps = {
  selectedBook: string | null;
  selectedVerse: string | null;
  defaultPlaceholder: string;
  isOpen: boolean;
  toggleDropdown: () => void;
  onClose: () => void;
  resetFilter: () => void;
};

export const GroupedTrigger = ({
  selectedBook,
  selectedVerse,
  defaultPlaceholder,
  isOpen,
  toggleDropdown,
  onClose,
  resetFilter,
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

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggleClick}
      className={styles.trigger}
      data-state={isOpen ? "open" : "closed"}
    >
      {displayText}
    </button>
  );
};

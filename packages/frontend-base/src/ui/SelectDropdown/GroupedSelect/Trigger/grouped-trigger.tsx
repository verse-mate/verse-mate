import { useEffect, useRef } from "react";
import { FilterIcon } from "../../../Icons";
import styles from "./grouped-trigger.module.css";

type GroupedTriggerProps = {
  isOpen: boolean;
  toggleDropdown: () => void;
  onClose: () => void;
  contentRef: React.RefObject<HTMLDivElement>;
  label: string;
};

export const GroupedTrigger = ({
  isOpen,
  toggleDropdown,
  onClose,
  contentRef,
  label,
}: GroupedTriggerProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, contentRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleDropdown}
      className={styles.trigger}
      data-state={isOpen ? "open" : "closed"}
    >
      {label}
    </button>
  );
};

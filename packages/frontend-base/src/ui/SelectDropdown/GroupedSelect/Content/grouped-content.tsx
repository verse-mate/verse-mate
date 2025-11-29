import { useEffect, useRef } from "react";
import styles from "./grouped-content.module.css";

type GroupedContentProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  isOpen: boolean;
  align?: string;
  onClose?: () => void;
};

export const GroupedContent = ({
  children,
  style,
  className,
  isOpen,
  onClose,
}: GroupedContentProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const passiveOptsRef = useRef<AddEventListenerOptions>({ passive: true });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;

      // Check if the click is on the trigger button or its children
      const isTriggerClick = target.closest('[data-dropdown-trigger="true"]');

      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !isTriggerClick &&
        onClose
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };

    if (isOpen) {
      // Small delay to prevent immediate closing when opening
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener(
          "touchstart",
          handlePointerDown,
          passiveOptsRef.current,
        );
        document.addEventListener("keydown", handleKeyDown);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener(
          "touchstart",
          handlePointerDown,
          passiveOptsRef.current,
        );
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Escape" || e.key === "Enter") && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={handleBackdropClick}
        onKeyDown={handleBackdropKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Close dropdown"
      />
      <div
        ref={containerRef}
        className={`${styles.container} ${className} ${isOpen ? styles.open : styles.hidden}`}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
};

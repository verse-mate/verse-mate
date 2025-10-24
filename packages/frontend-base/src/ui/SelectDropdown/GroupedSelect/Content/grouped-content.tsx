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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        onClose
      ) {
        onClose();
      }
    };

    if (isOpen) {
      // Small delay to prevent immediate closing when opening
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
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
      >
        {children}
      </div>
    </>
  );
};

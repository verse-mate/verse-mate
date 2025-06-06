import styles from "./grouped-content.module.css";

type GroupedContentProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  contentRef: React.RefObject<HTMLDivElement>;
};

export const GroupedContent = ({
  children,
  style,
  className,
  isOpen,
  contentRef,
}: GroupedContentProps) => {
  if (!isOpen) return null;

  return (
    <div
      ref={contentRef}
      className={`${styles.container} ${className} ${isOpen ? styles.open : styles.hidden}`}
      style={style}
    >
      {children}
    </div>
  );
};

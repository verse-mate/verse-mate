import styles from "./grouped-content.module.css";

type GroupedContentProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  isOpen: boolean;
  align?: string;
};

export const GroupedContent = ({
  children,
  style,
  className,
  isOpen,
}: GroupedContentProps) => {
  if (!isOpen) return null;

  return (
    <div
      className={`${styles.container} ${className} ${isOpen ? styles.open : styles.hidden}`}
      style={style}
    >
      {children}
    </div>
  );
};

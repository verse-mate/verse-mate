import styles from "./sidebar.module.css";

type SidebarProps = {
  children: React.ReactNode;
  isOpened: boolean;
  sidebarRef: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
  fullWidth?: boolean;
};

export const Sidebar = ({
  children,
  isOpened,
  sidebarRef,
  style,
  fullWidth = false,
}: SidebarProps) => {
  return (
    <div
      ref={sidebarRef}
      className={`${styles.sidebar} ${isOpened ? styles.open : ""} ${fullWidth ? styles.fullWidth : ""}`}
      style={style}
    >
      {children}
    </div>
  );
};

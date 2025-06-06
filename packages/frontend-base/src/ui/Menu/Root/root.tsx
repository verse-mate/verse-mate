import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  isOpened?: boolean;
  sidebarRef?: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
};

export const Root = ({ children, style }: RootProps) => {
  return (
    <div style={style} className={styles.container}>
      {children}
    </div>
  );
};

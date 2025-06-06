import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  flexBetween?: boolean;
  style?: React.CSSProperties;
};

export const Root = ({ children, flexBetween, style }: RootProps) => {
  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.container} ${flexBetween ? styles.flexBetween : ""}`}
        style={style}
      >
        {children}
      </div>
    </div>
  );
};

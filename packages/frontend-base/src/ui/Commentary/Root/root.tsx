import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const Root = ({ style, children }: RootProps) => {
  return (
    <div style={style} className={styles.container}>
      {children}
    </div>
  );
};

import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const Root = ({ children, style }: RootProps) => {
  return (
    <div className={`${styles.container}`} style={style}>
      {children}
    </div>
  );
};

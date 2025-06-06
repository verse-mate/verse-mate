import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
};

export const Root = ({ style, children, className }: RootProps) => {
  return (
    <footer style={style} className={`${styles.container} ${className}`}>
      {children}
    </footer>
  );
};

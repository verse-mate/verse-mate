import styles from "./content.module.css";

type ContentProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const Content = ({ style, children }: ContentProps) => {
  return (
    <footer style={style} className={styles.container}>
      {children}
    </footer>
  );
};

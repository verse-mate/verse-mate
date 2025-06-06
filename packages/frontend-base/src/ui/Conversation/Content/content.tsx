import styles from "./content.module.css";

type ContentProps = {
  children: React.ReactNode;
};

export const Content = ({ children }: ContentProps) => {
  return <div className={styles.container}>{children}</div>;
};

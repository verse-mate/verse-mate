import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
};

export function Root({ children }: RootProps) {
  return <div className={styles.container}>{children}</div>;
}

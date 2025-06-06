import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return <main className={styles.container}>{children}</main>;
};

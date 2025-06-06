import styles from "./header.module.css";

type HeaderProps = {
  children: React.ReactNode;
};

export const Header = ({ children }: HeaderProps) => {
  return <div className={styles.container}>{children}</div>;
};

import styles from "./list-item.module.css";

type ListItemProps = {
  children: React.ReactNode;
};

export const ListItem = ({ children }: ListItemProps) => {
  return <div className={styles.container}>{children}</div>;
};

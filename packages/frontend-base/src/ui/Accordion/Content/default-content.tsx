import styles from "./default-content.module.css";

type DefaultContentProps = {
  value: string;
};

export const DefaultContent = ({ value }: DefaultContentProps) => {
  return <div className={styles.container}>{value}</div>;
};

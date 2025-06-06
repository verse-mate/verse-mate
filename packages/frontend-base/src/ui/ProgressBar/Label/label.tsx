import styles from "./label.module.css";

type LabelProps = {
  value: number;
};

export const Label = ({ value }: LabelProps) => {
  return <span className={`${styles.progressText}`}>{value}%</span>;
};

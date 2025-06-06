import styles from "./indicator.module.css";

type IndicatorProps = {
  value: number;
};

export const Indicator = ({ value }: IndicatorProps) => {
  return (
    <div className={`${styles.progress}`} style={{ width: `${value}%` }} />
  );
};

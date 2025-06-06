import styles from "./indicator-background.module.css";

type IndicatorBackgroundProps = {
  children: React.ReactNode;
};

export const IndicatorBackground = ({ children }: IndicatorBackgroundProps) => {
  return <div className={`${styles.barBackgroundColor}`}>{children}</div>;
};

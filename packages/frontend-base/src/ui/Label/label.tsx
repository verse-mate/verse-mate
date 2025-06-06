import styles from "./label.module.css";

type LabelProps = {
  children: string;
};

export const LabelComponent = ({ children }: LabelProps) => {
  return <label className={styles.label}>{children}</label>;
};

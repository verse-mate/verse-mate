import styles from "./explanation.module.css";

type ExplanationProps = {
  subtitle?: string;
  explanation: string;
};

export const Explanation = ({ subtitle, explanation }: ExplanationProps) => {
  return (
    <div className={styles.container}>
      <section className={styles.content}>
        <h2>{subtitle}</h2>
        <span>{explanation}</span>
      </section>
    </div>
  );
};

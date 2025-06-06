import styles from "./average.module.css";

type AverageProps = {
  averageRating: number;
  maxRating: number;
};

export const Average = ({ averageRating, maxRating }: AverageProps) => {
  return (
    <div className={styles.container}>
      <h2>
        ({averageRating.toFixed(1)}/{maxRating})
      </h2>
    </div>
  );
};

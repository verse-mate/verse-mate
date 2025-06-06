import styles from "./footer.module.css";

type FooterProps = {
  currentRating: number;
  maxRating: number;
};

export const Footer = ({ currentRating, maxRating }: FooterProps) => {
  return (
    <div className={styles.container}>
      <p>
        You rated this {currentRating} out of {maxRating}
      </p>
    </div>
  );
};

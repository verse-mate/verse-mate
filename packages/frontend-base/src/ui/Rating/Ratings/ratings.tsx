import styles from "./ratings.module.css";

type RatingsProps = {
  children: React.ReactNode;
};

export const Ratings = ({ children }: RatingsProps) => {
  return <div className={styles.container}>{children}</div>;
};

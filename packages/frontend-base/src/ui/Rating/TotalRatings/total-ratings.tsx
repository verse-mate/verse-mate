import { UserIcon } from "../../Icons";
import styles from "./total-ratings.module.css";

type TotalRatingsProps = {
  totalRatings: number;
};

export const TotalRatings = ({ totalRatings }: TotalRatingsProps) => {
  return (
    <div className={styles.container}>
      <UserIcon className={styles.userIcon} />
      <span>{totalRatings}</span>
    </div>
  );
};

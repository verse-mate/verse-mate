import { StarIcon } from "../../Icons";
import styles from "./stars.module.css";

type StarsProps = {
  maxRating: number;
  currentRating: number;
  hoverRating: number | null;
  setRating: (rating: number) => void;
  setHoverRating: (rating: number | null) => void;
};

export const Stars = ({
  maxRating,
  currentRating,
  hoverRating,
  setRating,
  setHoverRating,
}: StarsProps) => {
  const handleMouseEnter = (index: number) => setHoverRating(index);
  const handleMouseLeave = () => setHoverRating(null);
  const handleClick = (index: number) => setRating(index);

  const renderStars = () => {
    const stars = [];

    for (let i = 1; i <= maxRating; i++) {
      const isFilled =
        hoverRating !== null ? i <= hoverRating : i <= currentRating;

      stars.push(
        <StarIcon
          key={i}
          className={`${styles.star} ${isFilled ? styles.filled : ""}`}
          onMouseEnter={() => handleMouseEnter(i)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(i)}
        />,
      );
    }
    return stars;
  };

  return <div className={styles.container}>{renderStars()}</div>;
};

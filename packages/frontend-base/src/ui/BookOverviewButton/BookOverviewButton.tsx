import { getBookIntroduction } from "../../data/book-intros.mock";
import { useSaveSearchParams } from "../../hooks/useSearchParams";
import * as Icon from "../Icons";
import styles from "./book-overview-button.module.css";

type BookOverviewButtonProps = {
  bookId: number;
  className?: string;
};

export const BookOverviewButton = ({
  bookId,
  className,
}: BookOverviewButtonProps) => {
  const { saveSearchParams } = useSaveSearchParams();

  // Check if intro exists for this book
  const introData = getBookIntroduction(bookId);

  // Don't render if no intro available
  if (!introData) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Show intro by setting showIntro URL param
    saveSearchParams({ showIntro: true });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${styles.button} ${className || ""}`}
      title="View Book Overview"
      aria-label="View Book Overview"
    >
      <Icon.OpenedBook className={styles.icon} />
    </button>
  );
};

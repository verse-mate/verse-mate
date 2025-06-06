import { fetchExplanation } from "../../hooks/useBible";
import { useRating } from "../../hooks/useRating";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import * as Icons from "../Icons";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Rating } from "../Rating";
import styles from "./explanation.module.css";

export const Content = () => {
  const { session } = userSession();
  const { bookId, verseId, explanationType } = useGetSearchParams();
  const { explanation, error, isLoading } = fetchExplanation(
    bookId,
    Number(verseId),
    explanationType,
  );
  const {
    maxRating,
    currentRating,
    hoverRating,
    totalRatings,
    averageRating,
    setRating,
    setHoverRating,
  } = useRating(5, session, bookId, verseId, explanation?.explanation_id);

  return (
    <>
      {error && (
        <div className={styles.explanationContent}>Error: {error.message}</div>
      )}

      {isLoading && !explanation && (
        <div className={styles.explanationContent}>
          <div className={styles.loadingCard}>
            <Icons.ProgressActivity className={styles.animateSpin} />
            <span className={styles.textFade}>
              A new explanation is being generated, please wait...
            </span>
          </div>
        </div>
      )}

      {explanation?.explanation && (
        <div className={styles.explanationContent}>
          <MarkdownRenderer.Root>
            <MarkdownRenderer.Renderer
              markdownContent={explanation}
              // className={styles.markdown}
            />
          </MarkdownRenderer.Root>
          {session?.id && (
            <Rating.Root className={styles.rating}>
              <Rating.Title title="Commentary Rating" />
              <Rating.Content>
                <Rating.Ratings>
                  <Rating.Stars
                    maxRating={maxRating}
                    currentRating={averageRating}
                    hoverRating={hoverRating}
                    setRating={setRating}
                    setHoverRating={setHoverRating}
                  />
                  <Rating.Average
                    maxRating={maxRating}
                    averageRating={averageRating}
                  />
                  <Rating.TotalRatings totalRatings={totalRatings} />
                </Rating.Ratings>
                <Rating.Footer
                  currentRating={currentRating}
                  maxRating={maxRating}
                />
              </Rating.Content>
            </Rating.Root>
          )}
        </div>
      )}
    </>
  );
};

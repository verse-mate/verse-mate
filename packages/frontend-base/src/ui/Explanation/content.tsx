import { fetchExplanation } from "../../hooks/useBible";
import { useRating } from "../../hooks/useRating";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import * as Icons from "../Icons";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Rating } from "../Rating";
import styles from "./explanation.module.css";

export const Content = ({
  explanation: explanationFromProp,
}: { explanation?: any }) => {
  const { session } = userSession();
  const { bookId, verseId, explanationType, bibleVersion } =
    useGetSearchParams();
  const {
    explanation: explanationFromFetch,
    error: fetchError,
    isLoading: fetchIsLoading,
  } = fetchExplanation(
    Number(bookId),
    Number(verseId),
    explanationType,
    bibleVersion,
  );

  const explanation = explanationFromProp || explanationFromFetch;

  // Only use fetch error/loading state if explanation is not provided as prop
  const error = explanationFromProp ? explanationFromProp.error : fetchError;
  const isLoading = explanationFromProp
    ? explanationFromProp.isLoading
    : fetchIsLoading;

  const {
    maxRating,
    currentRating,
    hoverRating,
    totalRatings,
    averageRating,
    setRating,
    setHoverRating,
  } = useRating(
    5,
    session,
    Number(bookId),
    verseId,
    explanation?.explanation_id,
  );

  return (
    <>
      {error && (
        <div>
          Error: An unexpected error occurred.
          {process.env.NODE_ENV !== "production" && (
            <span style={{ display: "block", marginTop: 4 }}>
              {typeof error === "object" && error && "message" in error
                ? String((error as any).message)
                : typeof error === "string"
                  ? error
                  : ""}
            </span>
          )}
        </div>
      )}

      {isLoading && !explanation && (
        <div className={styles.loadingCard}>
          <Icons.ProgressActivity className={styles.animateSpin} />
          <span className={styles.textFade}>
            A new explanation is being generated, please wait...
          </span>
        </div>
      )}

      {explanation?.explanation && (
        <>
          <MarkdownRenderer.Root>
            <MarkdownRenderer.Renderer
              markdownContent={
                typeof explanation.explanation === "string"
                  ? explanation.explanation
                  : ""
              }
              language={explanation.language_code}
              className={styles.markdown}
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
        </>
      )}
    </>
  );
};

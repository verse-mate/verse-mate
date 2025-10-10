import type { Story, StoryDefault } from "@ladle/react";
import { useRating } from "../../hooks/useRating";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import { Rating } from "./index";

export default {
  title: "ui/Rating",
} satisfies StoryDefault;

export const Default: Story = () => {
  const { session } = userSession();
  const { bookId, verseId } = useGetSearchParams();

  const {
    maxRating,
    currentRating,
    hoverRating,
    totalRatings,
    averageRating,
    setRating,
    setHoverRating,
  } = useRating(5, session, Number(bookId), verseId);

  return (
    <Rating.Root>
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
          <Rating.Average maxRating={maxRating} averageRating={averageRating} />
          <Rating.TotalRatings totalRatings={totalRatings} />
        </Rating.Ratings>
        <Rating.Footer currentRating={currentRating} maxRating={maxRating} />
      </Rating.Content>
    </Rating.Root>
  );
};

import { type Static, t } from "elysia";

export const RatingDto = t.Object({
  book_id: t.Number(),
  chapter_number: t.Number(),
  user: t.Object({
    id: t.String({
      format: "uuid",
      error: "Invalid user id",
    }),
  }),
  rating: t.Number({ minimum: 1 }),
  explanation_id: t.Number(),
});

export type RatingDto = Static<typeof RatingDto>;

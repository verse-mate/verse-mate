import { type Static, t } from "elysia";
import { UserDto } from "../user/user.dto";
import { ChapterDto } from "./chapter.dto";
import { ExplanationDto } from "./explanation.dto";

export const RatingDto = t.Intersect([
  t.Pick(ChapterDto, ["book_id", "chapter_number"]),
  t.Object({
    user: t.Pick(UserDto, ["id"]),
    rating: t.Number({ minimum: 1 }),
  }),
  t.Intersect([t.Pick(ExplanationDto, ["explanation_id"])]),
]);

export type RatingDto = Static<typeof RatingDto>;

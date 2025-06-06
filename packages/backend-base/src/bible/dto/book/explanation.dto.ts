import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { type Static, t } from "elysia";
import { ChapterDto } from "./chapter.dto";

export const ExplanationDto = t.Intersect([
  t.Pick(ChapterDto, ["book_id", "chapter_number"]),
  t.Object({
    explanation_id: t.Number(),
    type: t.Enum(ExplanationTypeEnum),
    explanation: t.Union([t.String(), t.Null()]),
  }),
]);

export type ExplanationDto = Static<typeof ExplanationDto>;

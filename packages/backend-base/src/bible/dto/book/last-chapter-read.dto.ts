import { type Static, t } from "elysia";
import { UserDto } from "../user/user.dto";
import { ChapterDto } from "./chapter.dto";

export const LastChapterReadDto = t.Intersect([
  t.Pick(UserDto, ["id"]),
  t.Pick(ChapterDto, ["book_id", "chapter_id", "chapter_number"]),
  t.Object({ user_progress_id: t.Number() }),
]);

export type LastChapterReadDto = Static<typeof LastChapterReadDto>;

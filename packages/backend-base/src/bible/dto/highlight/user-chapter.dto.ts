import { type Static, t } from "elysia";

export const UserChapterDto = t.Object({
  user_id: t.String(),
  chapter_id: t.Number(),
});

export type UserChapterDto = Static<typeof UserChapterDto>;

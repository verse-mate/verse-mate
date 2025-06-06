import { type Static, t } from "elysia";

export const SubtitlesDto = t.Object({
  chapter_id: t.Number(),
  subtitle: t.String(),
  start_verse: t.Number(),
  end_verse: t.Number(),
});

export type SubtitlesDto = Static<typeof SubtitlesDto>;

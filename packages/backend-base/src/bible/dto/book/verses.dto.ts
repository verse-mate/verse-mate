import { type Static, t } from "elysia";

export const VersesDto = t.Array(
  t.Object({
    verseNumber: t.Number(),
    text: t.String(),
  }),
);

export type VersesDto = Static<typeof VersesDto>;

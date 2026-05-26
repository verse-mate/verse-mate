import { type Static, t } from "elysia";

/**
 * One token on a Strong's-tagged verse. Joining each token's `text` field
 * reproduces the verse text byte-for-byte — the lossless-join invariant
 * the seed loader and chapter endpoint both enforce.
 */
const VerseTokenDto = t.Object({
  text: t.String(),
  /** Strong's number in canonical G####/H#### form (4-digit padded). */
  strongs: t.Optional(t.String()),
  /** Secondary Strong's for compound surface words (e.g. "Jesucristo"). */
  strongs_alt: t.Optional(t.Array(t.String())),
  /** Optional LLM-alignment confidence 0..1 (omitted for published sources). */
  confidence: t.Optional(t.Number()),
});

/**
 * Per-verse element returned by `/bible/book/:bookId/:chapterNumber`.
 *
 * `text` is always present (back-compat with every existing caller).
 * `tokens` is an optional additive field — populated only when the caller
 * passes `?tagged=1` AND the row has Strong's data seeded. Clients that
 * understand Strong's prefer `tokens` (one underlined surface per
 * `strongs` entry); clients that don't keep rendering `text` exactly as
 * before. Joining each `tokens[*].text` reproduces `text` byte-for-byte.
 */
export const VersesDto = t.Array(
  t.Object({
    verseNumber: t.Number(),
    text: t.String(),
    tokens: t.Optional(t.Array(VerseTokenDto)),
  }),
);

export type VersesDto = Static<typeof VersesDto>;

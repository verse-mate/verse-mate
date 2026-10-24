/**
 * Turns what the user typed into the two Postgres text-search queries the
 * Bible search runs.
 *
 * The input is split into words (runs of letters, combining marks and
 * digits — marks so Devanagari vowel signs stay inside their word), and each
 * word is single-quoted before the words are joined with tsquery operators.
 * A word can only hold \p{L}\p{M}\p{N}, so nothing the user types (`:`, `&`,
 * `|`, `!`, `(`, quotes) ever reaches the tsquery syntax. Postgres then
 * lower-cases, unaccents and (for `stems`) stems each quoted word through
 * the version's text search configuration.
 *
 * While the user is still typing, the last word is matched as a prefix
 * (`wes:*` finds "west"), so results don't flash empty between keystrokes.
 * A trailing space means the word is finished. One-letter prefixes are not
 * used: they'd match most of the Bible.
 */

export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_WORDS = 12;
const MAX_WORD_LENGTH = 40;
const MIN_PREFIX_LENGTH = 2;

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

export interface ParsedSearchQuery {
  words: string[];
  /** Whether the last word is matched as a prefix. */
  prefix: boolean;
  /** `'east' <-> 'and' <-> 'wes':*` — every word, in order (exact phrase). */
  phrase: string;
  /** `'east' & 'and' & 'wes':*` — every word, any order (stop words are
   * dropped by the stemming config). */
  allWords: string;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery | null {
  const input = raw.slice(0, MAX_QUERY_LENGTH);
  const words = (input.match(WORD) ?? [])
    .slice(0, MAX_QUERY_WORDS)
    .map((w) => w.slice(0, MAX_WORD_LENGTH));
  if (words.length === 0) return null;
  // A single one-letter word ("a", "I") is not a search.
  if (words.length === 1 && [...words[0]].length < 2) return null;

  const last = words[words.length - 1];
  const endsMidWord = /[\p{L}\p{M}\p{N}]$/u.test(input);
  const prefix = endsMidWord && [...last].length >= MIN_PREFIX_LENGTH;

  const quoted = words.map((w, i) => {
    const lexeme = `'${w}'`;
    return prefix && i === words.length - 1 ? `${lexeme}:*` : lexeme;
  });

  return {
    words,
    prefix,
    phrase: quoted.join(" <-> "),
    allWords: quoted.join(" & "),
  };
}

export const HIGHLIGHT_START = "⟦";
export const HIGHLIGHT_STOP = "⟧";

/**
 * Reads `ts_headline` output (matches wrapped in ⟦ ⟧) back into character
 * ranges over the original verse text.
 *
 * ts_headline bolds every occurrence of every query word, so for an
 * exact-phrase match (`phrase` given) only the occurrences of the whole
 * phrase are kept: for "east and west" in "…from east and west, and
 * recline…" the second "and" is not bold.
 *
 * Returns [] when the markers don't reproduce the original text exactly —
 * the client then shows the verse without bold rather than bold in the
 * wrong place.
 */
export function highlightRanges(
  headline: string,
  original: string,
  phrase?: { words: string[]; prefix: boolean },
): [number, number][] {
  const ranges: [number, number][] = [];
  let plain = "";
  let start = -1;
  for (const ch of headline) {
    if (ch === HIGHLIGHT_START) {
      start = plain.length;
    } else if (ch === HIGHLIGHT_STOP) {
      if (start >= 0 && plain.length > start)
        ranges.push([start, plain.length]);
      start = -1;
    } else {
      plain += ch;
    }
  }
  if (plain !== original) return [];
  if (!phrase || phrase.words.length < 2) return ranges;

  const wanted = phrase.words.map(fold);
  const last = wanted.length - 1;
  const wordAt = (i: number) =>
    fold(original.slice(ranges[i][0], ranges[i][1]));
  const kept = new Set<number>();
  for (let i = 0; i + last < ranges.length; i++) {
    let ok = true;
    for (let k = 0; k <= last && ok; k++) {
      const word = wordAt(i + k);
      ok =
        k === last && phrase.prefix
          ? word.startsWith(wanted[k])
          : word === wanted[k];
      // Words of one occurrence are separated by spaces/punctuation only.
      if (ok && k > 0) {
        const gap = original.slice(ranges[i + k - 1][1], ranges[i + k][0]);
        ok = !/[\p{L}\p{M}\p{N}]/u.test(gap);
      }
    }
    if (ok) for (let k = 0; k <= last; k++) kept.add(i + k);
  }
  return ranges.filter((_, i) => kept.has(i));
}

/** Case- and accent-insensitive form of a word, for comparing only. */
function fold(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

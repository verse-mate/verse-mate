import { describe, expect, it } from "bun:test";
import {
  HIGHLIGHT_STOP as E,
  MAX_QUERY_WORDS,
  HIGHLIGHT_START as S,
  highlightRanges,
  parseSearchQuery,
} from "./search-query";

describe("parseSearchQuery", () => {
  it("matches the last word as a prefix while typing", () => {
    expect(parseSearchQuery("east and wes")).toEqual({
      words: ["east", "and", "wes"],
      prefix: true,
      phrase: "'east' <-> 'and' <-> 'wes':*",
      allWords: "'east' & 'and' & 'wes':*",
    });
  });

  it("treats a trailing space as a finished word", () => {
    const parsed = parseSearchQuery("east and west ");
    expect(parsed?.prefix).toBe(false);
    expect(parsed?.phrase).toBe("'east' <-> 'and' <-> 'west'");
  });

  it("never uses a one-letter prefix", () => {
    expect(parseSearchQuery("love i")?.allWords).toBe("'love' & 'i'");
  });

  it("drops tsquery syntax and punctuation from the input", () => {
    const parsed = parseSearchQuery("east:* & (west) | !north <-> 'south'");
    expect(parsed?.words).toEqual(["east", "west", "north", "south"]);
    expect(parsed?.phrase).toBe("'east' <-> 'west' <-> 'north' <-> 'south'");
  });

  it("splits on hyphens and apostrophes like the Postgres parser", () => {
    expect(parseSearchQuery("son-in-law")?.words).toEqual(["son", "in", "law"]);
    expect(parseSearchQuery("the Lord’s prayer")?.words).toEqual([
      "the",
      "Lord",
      "s",
      "prayer",
    ]);
  });

  it("keeps accents and Devanagari vowel signs inside the word", () => {
    expect(parseSearchQuery("Jesús")?.words).toEqual(["Jesús"]);
    expect(parseSearchQuery("तुम्हें प्रेम")?.words).toEqual(["तुम्हें", "प्रेम"]);
    expect(parseSearchQuery("Їжа")?.words).toEqual(["Їжа"]);
  });

  it("rejects input with nothing searchable", () => {
    expect(parseSearchQuery("")).toBeNull();
    expect(parseSearchQuery("  :: !!")).toBeNull();
    expect(parseSearchQuery("a")).toBeNull();
  });

  it("caps the number of words", () => {
    const parsed = parseSearchQuery("word ".repeat(40));
    expect(parsed?.words.length).toBe(MAX_QUERY_WORDS);
  });
});

describe("highlightRanges", () => {
  it("reads the markers back into ranges over the original text", () => {
    const text = "As far as the east is from the west, so far";
    const headline = `As far as the ${S}east${E} is from the ${S}west${E}, so far`;
    expect(highlightRanges(headline, text)).toEqual([
      [14, 18],
      [31, 35],
    ]);
  });

  it("keeps only the phrase run for exact matches", () => {
    const text = "come from east and west, and recline";
    const headline = `come from ${S}east${E} ${S}and${E} ${S}west${E}, ${S}and${E} recline`;
    const phrase = { words: ["east", "and", "west"], prefix: false };
    expect(highlightRanges(headline, text, phrase)).toEqual([
      [10, 14],
      [15, 18],
      [19, 23],
    ]);
  });

  it("matches the phrase case- and accent-insensitively, last word as prefix", () => {
    const text = "Jesús said: East and Western";
    const headline = `${S}Jesús${E} said: ${S}East${E} and ${S}Western${E}`;
    expect(
      highlightRanges(headline, text, {
        words: ["jesus", "said"],
        prefix: false,
      }),
    ).toEqual([]);
    const h2 = `Jesús said: ${S}East${E} ${S}and${E} ${S}Western${E}`;
    expect(
      highlightRanges(h2, text, {
        words: ["east", "and", "wes"],
        prefix: true,
      }),
    ).toEqual([
      [12, 16],
      [17, 20],
      [21, 28],
    ]);
  });

  it("returns nothing when the markers don't reproduce the text", () => {
    expect(highlightRanges(`${S}east${E} and`, "East and")).toEqual([]);
  });

  it("counts positions in UTF-16 units, as JavaScript strings do", () => {
    const text = "Jesús wept";
    expect(highlightRanges(`${S}Jesús${E} wept`, text)).toEqual([[0, 5]]);
  });
});

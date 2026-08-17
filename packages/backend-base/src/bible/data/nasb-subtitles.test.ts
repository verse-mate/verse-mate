import { describe, expect, it } from "bun:test";

/**
 * Guards the section headings in NASB1995.json against the whitespace defect
 * that produced "The Day of theLordand the Future".
 *
 * The upstream scrape rendered the divine name as a small-caps element and the
 * text extraction dropped the whitespace on both sides of it, so
 * "the <span>Lord</span> and" collapsed to "theLordand". 59 headings shipped
 * that way. Anyone re-scraping or re-importing this file should fail here
 * rather than in the reader.
 *
 * Deliberately pure data assertions: no database, no env, no OpenAI client.
 */

interface Subtitle {
  subtitle: string;
  start_verse: number;
  end_verse: number;
}

type Chapter = Record<string, unknown> & { subtitles?: Subtitle[] };

async function loadSubtitles(): Promise<{ ref: string; text: string }[]> {
  const data = await Bun.file(`${import.meta.dir}/NASB1995.json`).json();
  const out: { ref: string; text: string }[] = [];

  for (const [book, chapters] of Object.entries(
    data.resultset as Record<string, Record<string, Chapter>>,
  )) {
    for (const [chapter, chapterData] of Object.entries(chapters)) {
      for (const sub of chapterData.subtitles ?? []) {
        out.push({ ref: `${book} ${chapter}`, text: sub.subtitle });
      }
    }
  }

  return out;
}

describe("NASB1995 section headings", () => {
  it("never glues the divine name to the surrounding words", async () => {
    const subtitles = await loadSubtitles();
    expect(subtitles.length).toBeGreaterThan(0);

    // "theLord" / "TheLord", and "Lord"/"Lord’s" run into the next word.
    const glued = subtitles.filter(
      ({ text }) => /[Tt]heLord/.test(text) || /Lord(’s)?[A-Za-z]/.test(text),
    );

    expect(glued.map((s) => `${s.ref}: ${s.text}`)).toEqual([]);
  });

  it("keeps Obadiah 1's heading readable", async () => {
    const subtitles = await loadSubtitles();
    const obadiah = subtitles
      .filter((s) => s.ref === "Obadiah 1")
      .map((s) => s.text);

    expect(obadiah).toContain("The Day of the Lord and the Future");
  });

  it("has no heading with a word boundary lost to a missing space", async () => {
    const subtitles = await loadSubtitles();

    // A lowercase letter or closing quote butted against a capital is the
    // signature of a dropped space, whatever element the scrape swallowed.
    const suspicious = subtitles.filter(({ text }) =>
      /[a-z’”][A-Z]/.test(text),
    );

    expect(suspicious.map((s) => `${s.ref}: ${s.text}`)).toEqual([]);
  });
});

import { BibleRepository } from "../bible/repository/bible.repository";
import type { db } from "./shared.plugin";

export async function parseAndInjectVerses(
  text: string,
  bibleVersion: string,
  database: db,
) {
  const bibleRepository = new BibleRepository(database);
  const verseRegex = /{verse:([\w\d .'-]+)\s+(\d+):(\d+)}/g;
  const placeholders = [...text.matchAll(verseRegex)];

  if (placeholders.length === 0) {
    return text;
  }

  const verseRefs = placeholders.map((match) => ({
    fullMatch: match[0],
    bookName: match[1].trim(),
    chapterNumber: Number.parseInt(match[2], 10),
    verseNumber: Number.parseInt(match[3], 10),
  }));

  // Group by book and chapter to fetch verses efficiently
  const refsByChapter = verseRefs.reduce(
    (acc, ref) => {
      const key = `${ref.bookName}-${ref.chapterNumber}`;
      if (!acc[key]) {
        acc[key] = {
          bookName: ref.bookName,
          chapterNumber: ref.chapterNumber,
          verses: new Set(),
        };
      }
      acc[key].verses.add(ref.verseNumber);
      return acc;
    },
    {} as Record<
      string,
      { bookName: string; chapterNumber: number; verses: Set<number> }
    >,
  );

  let processedText = text;

  for (const key in refsByChapter) {
    const chapterRef = refsByChapter[key];
    const fetchedVerses =
      await bibleRepository.getSpecificVersesByBookNameAndChapter(
        chapterRef.bookName,
        chapterRef.chapterNumber,
        bibleVersion,
        Array.from(chapterRef.verses),
      );

    for (const verse of fetchedVerses) {
      const placeholder = `{verse:${chapterRef.bookName} ${chapterRef.chapterNumber}:${verse.verseNumber}}`;
      // Use a regex for replacement to handle global occurrences
      const replacementRegex = new RegExp(placeholder, "g");
      processedText = processedText.replace(replacementRegex, verse.text);
    }
  }

  return processedText;
}

import { BibleRepository } from "../bible/repository/bible.repository";
import type { db } from "./shared.plugin";

export async function parseAndInjectVerses(
  text: string,
  bibleVersion: string,
  database: db,
) {
  const bibleRepository = new BibleRepository(database);

  // Handle verse placeholders
  const verseRegex = /{verse:([\w\d .'\-]+)\s+(\d+):(\d+)(?:-(\d+))?}/g;
  const versePlaceholders = [...text.matchAll(verseRegex)];

  // Handle chapter placeholders
  const chapterRegex = /{chapter:([\w\d .'\-]+)\s+(\d+)(?:-(\d+))?}/g;
  const chapterPlaceholders = [...text.matchAll(chapterRegex)];

  if (versePlaceholders.length === 0 && chapterPlaceholders.length === 0) {
    return text;
  }

  // Process verse placeholders
  const verseRefs = versePlaceholders.map((match) => ({
    fullMatch: match[0],
    bookName: match[1].trim(),
    chapterNumber: Number.parseInt(match[2], 10),
    startVerse: Number.parseInt(match[3], 10),
    endVerse: match[4]
      ? Number.parseInt(match[4], 10)
      : Number.parseInt(match[3], 10),
  }));

  // Group by book and chapter to fetch verses efficiently
  const refsByChapter = verseRefs.reduce(
    (acc, ref) => {
      const key = `${ref.bookName}-${ref.chapterNumber}`;
      if (!acc[key]) {
        acc[key] = {
          bookName: ref.bookName,
          chapterNumber: ref.chapterNumber,
          verses: new Set<number>(),
        };
      }

      // Add all verses in the range
      for (let i = ref.startVerse; i <= ref.endVerse; i++) {
        acc[key].verses.add(i);
      }

      return acc;
    },
    {} as Record<
      string,
      { bookName: string; chapterNumber: number; verses: Set<number> }
    >,
  );

  let processedText = text;

  // Process verse placeholders
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
      const replacementRegex = new RegExp(
        placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g",
      );
      processedText = processedText.replace(replacementRegex, verse.text);
    }
  }

  // Process chapter placeholders
  const chapterRefs = chapterPlaceholders.map((match) => ({
    fullMatch: match[0],
    bookName: match[1].trim(),
    startChapter: Number.parseInt(match[2], 10),
    endChapter: match[3]
      ? Number.parseInt(match[3], 10)
      : Number.parseInt(match[2], 10),
  }));

  // Get version ID for chapter content fetching
  const version = await bibleRepository.getVersionBykey(bibleVersion);
  if (!version) {
    return processedText; // Return text with processed verses if version not found
  }

  // Process each chapter placeholder
  for (const chapterRef of chapterRefs) {
    let chapterContent = "";

    // Process each chapter in the range
    for (
      let chapterNum = chapterRef.startChapter;
      chapterNum <= chapterRef.endChapter;
      chapterNum++
    ) {
      const { chapter } = await bibleRepository.getChapterByBookNameAndNumber(
        chapterRef.bookName,
        chapterNum,
      );

      if (chapter?.chapter_id) {
        const { verses } =
          await bibleRepository.getChapterVersesByBookNameAndChapter(
            chapterRef.bookName,
            chapterNum,
            version.id,
          );

        if (verses) {
          // Format chapter content as verses with numbers
          const formattedVerses = verses
            .map((verse) => `${verse.verseNumber}\n${verse.text}`)
            .join("\n");

          // Add chapter heading if it's a range
          if (chapterRef.startChapter !== chapterRef.endChapter) {
            chapterContent += `## ${chapterRef.bookName} ${chapterNum}

${formattedVerses}

`;
          } else {
            chapterContent += formattedVerses;
          }
        }
      }
    }

    // Replace the placeholder with the chapter content
    const replacementRegex = new RegExp(
      chapterRef.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    );
    processedText = processedText.replace(
      replacementRegex,
      chapterContent.trim(),
    );
  }

  return processedText;
}

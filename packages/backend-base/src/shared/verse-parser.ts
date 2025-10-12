import { BibleRepository } from "../bible/repository/bible.repository";
import type { db } from "./shared.plugin";

/**
 * Normalize book names to handle common variations
 * Maps singular/alternate forms to the canonical plural forms used in the database
 */
function normalizeBookName(bookName: string): string {
  const normalized = bookName.trim();

  // Handle common book name variations
  const bookNameMap: Record<string, string> = {
    Psalm: "Psalms",
    "Song of Solomon": "Song of Songs",
    "Song of Song": "Song of Songs",
    "1 Corinthian": "1 Corinthians",
    "2 Corinthian": "2 Corinthians",
    "1 Thessalonian": "1 Thessalonians",
    "2 Thessalonian": "2 Thessalonians",
    "1 Peter": "1 Peter",
    "2 Peter": "2 Peter",
    "1 John": "1 John",
    "2 John": "2 John",
    "3 John": "3 John",
  };

  return bookNameMap[normalized] || normalized;
}

export async function parseAndInjectVerses(
  text: string,
  bibleVersion: string,
  database: db,
  options?: { includeReference?: boolean; includeVerseNumbers?: boolean },
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
  const verseRefs = versePlaceholders.map((match) => {
    const startVerse = Number.parseInt(match[3], 10);
    const endVerse = match[4] ? Number.parseInt(match[4], 10) : startVerse;
    return {
      fullMatch: match[0],
      bookName: normalizeBookName(match[1].trim()),
      chapterNumber: Number.parseInt(match[2], 10),
      startVerse,
      endVerse,
      isRange: endVerse > startVerse,
    };
  });

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

  // Process verse placeholders - we need to handle each original placeholder separately
  // because a range like {verse:Joel 2:28-32} needs to be replaced with the concatenated text of all verses in that range
  for (const verseRef of verseRefs) {
    const fetchedVerses =
      await bibleRepository.getSpecificVersesByBookNameAndChapter(
        verseRef.bookName,
        verseRef.chapterNumber,
        bibleVersion,
        Array.from(
          { length: verseRef.endVerse - verseRef.startVerse + 1 },
          (_, i) => verseRef.startVerse + i,
        ),
      );

    if (fetchedVerses.length > 0) {
      // Concatenate all verses in the range
      // Use verse numbers only if includeVerseNumbers is true (default behavior for backward compatibility)
      const includeVerseNumbers = options?.includeVerseNumbers !== false;
      const versesText = fetchedVerses
        .map((v) =>
          includeVerseNumbers ? `${v.verseNumber}\n${v.text}` : v.text,
        )
        .join("\n");

      let replacementText = versesText;
      if (options?.includeReference) {
        const referenceString = `(${verseRef.bookName} ${verseRef.chapterNumber}:${verseRef.startVerse}${verseRef.isRange ? `-${verseRef.endVerse}` : ""})`;
        replacementText = `${versesText} ${referenceString}`;
      }

      // Replace the original placeholder (which may include a range like 28-32)
      const replacementRegex = new RegExp(
        verseRef.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g",
      );
      processedText = processedText.replace(replacementRegex, replacementText);
    }
  }

  // Process chapter placeholders
  const chapterRefs = chapterPlaceholders.map((match) => ({
    fullMatch: match[0],
    bookName: normalizeBookName(match[1].trim()),
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
          // Use verse numbers only if includeVerseNumbers is true (default behavior for backward compatibility)
          const includeVerseNumbers = options?.includeVerseNumbers !== false;
          const formattedVerses = verses
            .map((verse) =>
              includeVerseNumbers
                ? `${verse.verseNumber}\n${verse.text}`
                : verse.text,
            )
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

    let replacementText = chapterContent.trim();
    if (options?.includeReference) {
      const isRange = chapterRef.startChapter !== chapterRef.endChapter;
      const referenceString = `(${chapterRef.bookName} ${chapterRef.startChapter}${isRange ? `-${chapterRef.endChapter}` : ""})`;
      replacementText = `${replacementText} ${referenceString}`;
    }

    // Replace the placeholder with the chapter content
    const replacementRegex = new RegExp(
      chapterRef.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    );
    processedText = processedText.replace(replacementRegex, replacementText);
  }

  return processedText;
}

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

/**
 * Add reference summaries under markdown section headers (##)
 * Groups all verse/chapter references under each section and displays them
 * in a format like: (Genesis 1:1-3, Genesis 2:7, Exodus 20:8-11)
 */
function addReferenceSummariesToSections(
  text: string,
  versePlaceholders: RegExpMatchArray[],
  chapterPlaceholders: RegExpMatchArray[],
): string {
  const lines = text.split("\n");
  const result: string[] = [];

  // Create a map of line index to placeholders that appear on/after that line
  const allPlaceholders = [
    ...versePlaceholders.map((m) => ({
      match: m[0],
      index: m.index || 0,
      bookName: m[1].trim(),
      chapter: Number.parseInt(m[2], 10),
      startVerse: Number.parseInt(m[3], 10),
      endVerse: m[4] ? Number.parseInt(m[4], 10) : Number.parseInt(m[3], 10),
      type: "verse" as const,
    })),
    ...chapterPlaceholders.map((m) => ({
      match: m[0],
      index: m.index || 0,
      bookName: m[1].trim(),
      startChapter: Number.parseInt(m[2], 10),
      endChapter: m[3] ? Number.parseInt(m[3], 10) : Number.parseInt(m[2], 10),
      type: "chapter" as const,
    })),
  ].sort((a, b) => a.index - b.index);

  let currentPosition = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    // Check if this is a section header (## Something)
    if (line.trim().startsWith("##") && !line.trim().startsWith("###")) {
      // Find all placeholders between this header and the next header (or end of text)
      const headerEndPosition = currentPosition + line.length + 1; // +1 for newline

      // Find the next section header position
      let nextHeaderPosition = text.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (
          lines[j].trim().startsWith("##") &&
          !lines[j].trim().startsWith("###")
        ) {
          // Calculate position of this next header
          const linesUpToNext = lines.slice(0, j);
          nextHeaderPosition = linesUpToNext.join("\n").length + 1;
          break;
        }
      }

      // Collect placeholders in this section
      const sectionPlaceholders = allPlaceholders.filter(
        (p) => p.index >= headerEndPosition && p.index < nextHeaderPosition,
      );

      if (sectionPlaceholders.length > 0) {
        // Format references
        const references = sectionPlaceholders.map((p) => {
          if (p.type === "verse") {
            const verseRange =
              p.startVerse === p.endVerse
                ? `${p.startVerse}`
                : `${p.startVerse}-${p.endVerse}`;
            return `${p.bookName} ${p.chapter}:${verseRange}`;
          }
          // chapter type
          const chapterRange =
            p.startChapter === p.endChapter
              ? `${p.startChapter}`
              : `${p.startChapter}-${p.endChapter}`;
          return `${p.bookName} ${chapterRange}`;
        });

        // Add reference summary line with blank line after for proper markdown separation
        result.push(`(${references.join(", ")})`);
        result.push(""); // Add blank line to separate from content
      }
    }

    currentPosition += line.length + 1; // +1 for newline
  }

  return result.join("\n");
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

  // If includeReference is true, add reference summaries under section headers
  let textWithHeaders = text;
  if (options?.includeReference) {
    textWithHeaders = addReferenceSummariesToSections(
      text,
      versePlaceholders,
      chapterPlaceholders,
    );
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

  let processedText = textWithHeaders;

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

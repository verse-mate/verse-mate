/**
 * Parser utility to convert topic markdown content into structured data
 * for rendering with the TopicText component.
 */

export interface ParsedTopicVerse {
  verseNumber: string; // Can be "1", "6", etc. - from the source book
  text: string; // The verse text without the number and reference
  reference: string; // The reference like "Hebrews 11:1"
}

export interface ParsedTopicSubtitle {
  subtitle: string;
  referenceList: string; // The grayed reference list under the subtitle
  verses: ParsedTopicVerse[];
}

export interface ParsedTopicContent {
  subtitles: ParsedTopicSubtitle[];
}

/**
 * Parses topic markdown text content into structured data
 */
export function parseTopicMarkdown(
  markdownContent: string,
): ParsedTopicContent {
  const result: ParsedTopicContent = {
    subtitles: [],
  };

  // Split by ## to get sections
  const sections = markdownContent.split(/^## /m).filter((s) => s.trim());

  sections.forEach((section) => {
    const lines = section.split("\n");
    const subtitle = lines[0]?.trim() || "";

    // Second line is usually the reference list in parentheses
    const referenceList = lines[1]?.trim() || "";

    // Rest of the lines are the verses
    const verseText = lines.slice(2).join("\n");
    const verses = parseVerses(verseText);

    result.subtitles.push({
      subtitle,
      referenceList,
      verses,
    });
  });

  return result;
}

/**
 * Parses individual verses from a paragraph text
 * Handles both:
 * - Verses with references: "[number]\n[text] ([reference])"
 * - Verses without references: "[number]\n[text]"
 */
function parseVerses(text: string): ParsedTopicVerse[] {
  const verses: ParsedTopicVerse[] = [];

  // Split text by verse numbers (lines that start with just a number)
  // This regex splits on newline followed by number and newline
  const parts = text.split(/\n(?=\d+\n)/);

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    // Try to match verse with reference: number, text, (reference)
    const withRefMatch = trimmedPart.match(/^(\d+)\s*\n([\s\S]*?)\(([^)]+)\)$/);
    if (withRefMatch) {
      verses.push({
        verseNumber: withRefMatch[1].trim(),
        text: withRefMatch[2].trim(),
        reference: withRefMatch[3].trim(),
      });
      continue;
    }

    // Try to match verse without reference: number, text (no parentheses at end)
    const withoutRefMatch = trimmedPart.match(/^(\d+)\s*\n([\s\S]+?)$/);
    if (withoutRefMatch) {
      // Check if this text doesn't end with a reference in parentheses
      const textPart = withoutRefMatch[2].trim();
      if (!textPart.endsWith(")")) {
        verses.push({
          verseNumber: withoutRefMatch[1].trim(),
          text: textPart,
          reference: "", // No reference for this verse
        });
      }
    }
  }

  return verses;
}

import type { BibleRepository } from "../repository/bible.repository";

interface VerseRange {
  start: number;
  end: number;
}

export class SubtitleService {
  constructor(private readonly bibleRepository: BibleRepository) {}

  /**
   * Get the best matching subtitle for a given verse range
   * @param bookName The name of the book
   * @param chapterNumber The chapter number
   * @param verseRange The verse range object with start and end properties
   * @param versionId The Bible version ID
   * @returns The best matching subtitle or null if none found
   */
  async getBestMatchingSubtitle(
    bookName: string,
    chapterNumber: number,
    verseRange: VerseRange,
    versionId: string,
  ): Promise<string | null> {
    // Get the chapter ID first
    const { chapter } =
      await this.bibleRepository.getChapterByBookNameAndNumber(
        bookName,
        chapterNumber,
      );

    if (!chapter?.chapter_id) {
      return null;
    }

    // Get all subtitles for this chapter and version
    const { subtitles } = await this.bibleRepository.getSubtitles({
      chapter_id: chapter.chapter_id,
      version_id: versionId,
    });

    if (!subtitles || subtitles.length === 0) {
      return null;
    }

    // Find the best matching subtitle based on the verse range
    // We'll look for subtitles that exactly match, encompass, or closely match the requested range
    const matchingSubtitles = subtitles.filter(
      (subtitle) =>
        subtitle.start_verse <= verseRange.end &&
        subtitle.end_verse >= verseRange.start,
    );

    if (matchingSubtitles.length === 0) {
      return null;
    }

    // If we have an exact match, return that
    const exactMatch = matchingSubtitles.find(
      (subtitle) =>
        subtitle.start_verse === verseRange.start &&
        subtitle.end_verse === verseRange.end,
    );

    if (exactMatch) {
      return exactMatch.subtitle;
    }

    // If we have an encompassing match (subtitle covers a wider range than requested), return that
    const encompassingMatches = matchingSubtitles.filter(
      (subtitle) =>
        subtitle.start_verse <= verseRange.start &&
        subtitle.end_verse >= verseRange.end,
    );

    if (encompassingMatches.length > 0) {
      // Return the most precise encompassing match (smallest range that still encompasses)
      encompassingMatches.sort(
        (a, b) =>
          Math.abs(a.end_verse - a.start_verse) -
          Math.abs(b.end_verse - b.start_verse),
      );
      return encompassingMatches[0].subtitle;
    }

    // Otherwise, return the first overlapping match
    return matchingSubtitles[0].subtitle;
  }

  /**
   * Enhance content with actual Bible subtitles by replacing AI-generated headers
   * @param content The markdown content to enhance
   * @param versionId The Bible version ID
   * @returns The enhanced content with actual subtitles where available
   */
  async enhanceContentWithSubtitles(
    content: string,
    versionId: string,
  ): Promise<string> {
    // Parse the markdown content into structured elements
    const elements = this.parseMarkdownElements(content);
    let enhancedContent = "";

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];

      if (element.type === "header" && element.level === 2) {
        // Check if this is a candidate for subtitle replacement
        const isCandidate = this.isSubtitleReplacementCandidate(
          element,
          elements,
          i,
        );

        if (isCandidate) {
          // Try to find a matching subtitle based on following verse content
          const nextVerseRange = this.extractNextVerseRange(elements, i);
          if (nextVerseRange) {
            const matchingSubtitle = await this.getBestMatchingSubtitle(
              nextVerseRange.bookName,
              nextVerseRange.chapterNumber,
              nextVerseRange.range,
              versionId,
            );

            if (matchingSubtitle && !this.isGenericHeader(element.content)) {
              // Replace the AI-generated header with the actual subtitle
              enhancedContent += `## ${matchingSubtitle}\n`;
            } else {
              // Keep the AI-generated header
              enhancedContent += element.content;
            }
          } else {
            // No verse range found, keep the original header
            enhancedContent += element.content;
          }
        } else {
          // Not a candidate for replacement, keep the original header
          enhancedContent += element.content;
        }
      } else {
        // Keep non-header content as-is
        enhancedContent += element.content;
      }
    }

    return enhancedContent;
  }

  /**
   * Parse markdown content into structured elements
   * @param content The markdown content to parse
   * @returns Array of parsed elements
   */
  private parseMarkdownElements(content: string): any[] {
    const lines = content.split("\n");
    const elements: any[] = [];
    let currentElement: any = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headerMatch) {
        // Save previous element if exists
        if (currentElement) {
          elements.push(currentElement);
        }

        // Create new header element
        currentElement = {
          type: "header",
          level: headerMatch[1].length,
          content: `${line}\n`,
          textContent: headerMatch[2],
        };
      } else {
        // Add line to current element or create text element
        if (currentElement) {
          currentElement.content += `${line}\n`;
        } else {
          if (!currentElement) {
            currentElement = {
              type: "text",
              content: `${line}\n`,
            };
          } else {
            currentElement.content += `${line}\n`;
          }
        }
      }
    }

    // Don't forget the last element
    if (currentElement) {
      elements.push(currentElement);
    }

    return elements;
  }

  /**
   * Check if a header is a candidate for subtitle replacement
   * @param headerElement The header element to check
   * @param allElements All elements in the content
   * @param currentIndex The current index of the header element
   * @returns True if the header is a candidate for replacement
   */
  private isSubtitleReplacementCandidate(
    headerElement: any,
    allElements: any[],
    currentIndex: number,
  ): boolean {
    // Check if header content suggests biblical content
    const headerText = headerElement.textContent.toLowerCase();
    const genericHeaders = [
      "overview",
      "summary",
      "introduction",
      "conclusion",
      "notes",
      "version",
    ];

    // If it's a generic header, don't replace
    if (genericHeaders.some((generic) => headerText.includes(generic))) {
      return false;
    }

    // Check if the next non-header element is a verse placeholder
    for (let i = currentIndex + 1; i < allElements.length; i++) {
      const nextElement = allElements[i];
      if (nextElement.type === "header") {
        break; // Stop at the next header
      }
      if (
        nextElement.type === "text" &&
        /{\s*verse:/.test(nextElement.content)
      ) {
        return true; // Found a verse placeholder
      }
    }

    return false;
  }

  /**
   * Check if a header is generic and should be preserved
   * @param headerContent The header content to check
   * @returns True if the header is generic
   */
  private isGenericHeader(headerContent: string): boolean {
    const genericHeaders = [
      "overview",
      "summary",
      "introduction",
      "conclusion",
      "notes",
      "version",
    ];
    const headerText = headerContent
      .replace(/^[#]+\s+/, "")
      .trim()
      .toLowerCase();
    return genericHeaders.some((generic) => headerText.includes(generic));
  }

  /**
   * Extract the next verse range from elements following a header
   * @param elements All elements in the content
   * @param headerIndex The index of the header element
   * @returns The extracted verse range information or null
   */
  private extractNextVerseRange(
    elements: any[],
    headerIndex: number,
  ): {
    bookName: string;
    chapterNumber: number;
    range: VerseRange;
  } | null {
    // Look for the next text element containing a verse placeholder
    for (let i = headerIndex + 1; i < elements.length; i++) {
      const element = elements[i];
      if (element.type === "header") {
        break; // Stop at the next header
      }

      if (element.type === "text") {
        // Match verse placeholders like {verse:Matthew 1:18-25} (tolerate whitespace inside braces)
        const verseRegex = /{\s*verse:([A-Za-z\s]+)\s+(\d+):(\d+)(?:-(\d+))?\s*}/;
        const match = element.content.match(verseRegex);

        if (match) {
          const bookName = match[1].trim();
          const chapterNumber = Number.parseInt(match[2], 10);
          const startVerse = Number.parseInt(match[3], 10);
          const endVerse = match[4]
            ? Number.parseInt(match[4], 10)
            : startVerse;

          return {
            bookName,
            chapterNumber,
            range: {
              start: startVerse,
              end: endVerse,
            },
          };
        }
      }
    }

    return null;
  }
}

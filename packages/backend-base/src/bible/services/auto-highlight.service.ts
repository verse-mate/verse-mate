import { ValidationError } from "../../common/errors";
import type { db } from "../../shared/shared.plugin";
import { AutoHighlightRepository } from "../repository/auto-highlight.repository";
import type { BibleRepository } from "../repository/bible.repository";

export class AutoHighlightService {
  private repository: AutoHighlightRepository;

  constructor(
    private readonly db: db,
    private readonly bibleRepository: BibleRepository,
  ) {
    this.repository = new AutoHighlightRepository(db);
  }

  async getHighlightsByChapter(params: {
    book_id: number;
    chapter_number: number;
    theme_ids?: number[];
    theme_relevance_map?: Map<number, number>;
    default_relevance?: number;
  }) {
    return this.repository.getHighlightsByChapter(params);
  }

  async getAllThemes() {
    return this.repository.getAllThemes();
  }

  async getActiveThemes() {
    return this.repository.getActiveThemes();
  }

  async getUserThemePreferences(user_id: string) {
    const allThemes = await this.repository.getActiveThemes();
    const userPrefs = await this.repository.getUserThemePreferences(user_id);

    const prefMap = new Map(userPrefs.map((p) => [p.theme_id, p]));

    return allThemes.map((theme) => {
      const pref = prefMap.get(theme.theme_id);
      return {
        theme_id: theme.theme_id,
        theme_name: theme.name,
        theme_color: theme.color,
        theme_description: theme.description,
        is_enabled: pref?.is_enabled ?? false, // Default to disabled for new users
        custom_color: pref?.custom_color ?? null,
        relevance_threshold: pref?.relevance_threshold ?? 3,
        admin_override: pref?.admin_override ?? false,
        default_relevance_threshold: theme.default_relevance_threshold,
      };
    });
  }

  async updateUserThemePreference(params: {
    user_id: string;
    theme_id: number;
    is_enabled?: boolean;
    custom_color?: string;
    relevance_threshold?: number;
    admin_override?: boolean;
  }) {
    return this.repository.upsertUserThemePreference(params);
  }

  async updateThemeActiveStatus(theme_id: number, is_active: boolean) {
    return this.repository.updateThemeActiveStatus(theme_id, is_active);
  }

  async updateThemeDefaultRelevance(
    theme_id: number,
    default_relevance_threshold: number,
  ) {
    if (default_relevance_threshold < 1 || default_relevance_threshold > 5) {
      throw new ValidationError("Relevance threshold must be between 1 and 5");
    }
    return this.repository.updateThemeDefaultRelevance(
      theme_id,
      default_relevance_threshold,
    );
  }

  async getGlobalDefaultRelevance(): Promise<number> {
    const setting = await this.repository.getGlobalSetting(
      "default_relevance_threshold",
    );
    return setting ? Number.parseInt(setting, 10) : 3;
  }

  async updateGlobalDefaultRelevance(relevance: number): Promise<void> {
    if (relevance < 1 || relevance > 5) {
      throw new ValidationError("Relevance must be between 1 and 5");
    }
    await this.repository.updateGlobalSetting(
      "default_relevance_threshold",
      relevance.toString(),
    );
  }

  async getDefaultAutoHighlightsEnabled(): Promise<boolean> {
    const setting = await this.repository.getGlobalSetting(
      "default_auto_highlights_enabled",
    );
    return setting === "true";
  }

  async updateDefaultAutoHighlightsEnabled(enabled: boolean): Promise<void> {
    await this.repository.updateGlobalSetting(
      "default_auto_highlights_enabled",
      enabled.toString(),
    );
  }

  /**
   * Parse AI response and extract highlights
   * Expected formats:
   * - {verse:Book Chapter:Verse} - Theme Name - Relevance: N
   * - {verse:Book Chapter:Verse-Verse} - Theme Name - Relevance: N
   * - {chapter:Book Chapter} - Theme Name - Relevance: N
   * - {chapter:Book Chapter-Chapter} - Theme Name - Relevance: N
   *
   * Examples:
   * - {verse:Genesis 1:1} - Key Verses - Relevance: 1
   * - {verse:Genesis 1:1-3} - Commands - Relevance: 2
   * - {chapter:Genesis 1} - Key Verses - Relevance: 3
   */
  async processAIResponse(bookId: number, aiResponse: string): Promise<number> {
    const highlights: any[] = [];

    // Capture theme name up to the " - Relevance:" delimiter and restrict relevance to 1-5
    const highlightRegex =
      /{(verse|chapter):([^}]+)}\s*-\s*(.*?)\s*-\s*Relevance:\s*([1-5])\b/gi;

    const matches = Array.from(aiResponse.matchAll(highlightRegex));

    for (const match of matches) {
      const placeholderType = match[1].toLowerCase();
      const reference = match[2].trim();
      const themeName = match[3].trim();
      const relevance = Number.parseInt(match[4], 10);

      if (relevance < 1 || relevance > 5) {
        console.warn(
          `[AUTO-HIGHLIGHT] Invalid relevance score ${relevance} for ${reference}`,
        );
        continue;
      }

      const theme = await this.repository.getThemeByName(themeName);
      if (!theme || theme.is_active === false) {
        console.warn(
          `[AUTO-HIGHLIGHT] Theme not found or inactive: ${themeName}`,
        );
        continue;
      }

      let parsedRef: {
        bookName: string;
        chapterNumber: number;
        startVerse?: number;
        endVerse?: number;
      } | null = null;

      if (placeholderType === "verse") {
        // Parse: "Genesis 1:1" or "Genesis 1:1-3"
        const verseMatch = reference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
        if (verseMatch) {
          const parsedBookName = verseMatch[1].trim();
          const chapterNumber = Number.parseInt(verseMatch[2], 10);
          const startVerse = Number.parseInt(verseMatch[3], 10);
          const endVerse = verseMatch[4]
            ? Number.parseInt(verseMatch[4], 10)
            : startVerse;

          // Ensure reference belongs to the requested bookId
          const { book } = await this.bibleRepository.getBook({
            book_id: bookId,
          });
          if (!book) {
            console.warn(`[AUTO-HIGHLIGHT] Book not found for ID: ${bookId}`);
            continue;
          }

          // Check if parsed book name matches the target book
          // Handle common variations (e.g., "Psalm" vs "Psalms")
          const bookNameLower = book.name.toLowerCase();
          const parsedNameLower = parsedBookName.toLowerCase();
          const isMatch =
            bookNameLower === parsedNameLower ||
            bookNameLower === `${parsedNameLower}s` || // "Psalm" -> "Psalms"
            `${bookNameLower}s` === parsedNameLower || // "Psalms" -> "Psalm"
            bookNameLower.replace(/\s+/g, "") ===
              parsedNameLower.replace(/\s+/g, ""); // Handle spacing differences

          if (!isMatch) {
            console.warn(
              `[AUTO-HIGHLIGHT] Reference book mismatch: "${parsedBookName}" (parsed) vs "${book.name}" (expected for bookId=${bookId})`,
            );
            continue;
          }

          if (
            !Number.isFinite(startVerse) ||
            !Number.isFinite(endVerse) ||
            startVerse <= 0 ||
            endVerse <= 0 ||
            endVerse < startVerse
          ) {
            console.warn(`[AUTO-HIGHLIGHT] Invalid verse range: ${reference}`);
            continue;
          }

          parsedRef = {
            bookName: parsedBookName,
            chapterNumber,
            startVerse,
            endVerse,
          };
        }
      } else if (placeholderType === "chapter") {
        // Parse: "Genesis 1" or "Genesis 1-3"
        const chapterMatch = reference.match(/^(.+?)\s+(\d+)(?:-(\d+))?$/);
        if (chapterMatch) {
          const chapterStart = Number.parseInt(chapterMatch[2], 10);
          const chapterEnd = chapterMatch[3]
            ? Number.parseInt(chapterMatch[3], 10)
            : chapterStart;

          const { book } = await this.bibleRepository.getBook({
            book_id: bookId,
          });
          if (!book) {
            console.warn(`[AUTO-HIGHLIGHT] Book not found for ID: ${bookId}`);
            continue;
          }

          // For each chapter in the range, get verse count and add highlight
          // Get default Bible version UUID
          const defaultVersion = await this.db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .where("version_key", "=", "NASB1995")
            .select("id")
            .executeTakeFirst();

          if (!defaultVersion) {
            console.warn(
              "[AUTO-HIGHLIGHT] Default version not found, skipping chapter placeholder",
            );
            continue;
          }

          for (let chNum = chapterStart; chNum <= chapterEnd; chNum++) {
            const { verses } =
              await this.bibleRepository.getChapterVersesByBookNameAndChapter(
                book.name,
                chNum,
                defaultVersion.id, // Use actual UUID
              );

            if (verses && verses.length > 0) {
              highlights.push({
                theme_id: theme.theme_id,
                book_id: bookId,
                chapter_number: chNum,
                start_verse: 1,
                end_verse: verses.length,
                relevance_score: relevance,
              });
            }
          }
          continue; // Skip to next match since we handled chapters
        }
      }

      if (!parsedRef) {
        console.warn(
          `[AUTO-HIGHLIGHT] Could not parse reference: ${reference}`,
        );
        continue;
      }

      highlights.push({
        theme_id: theme.theme_id,
        book_id: bookId,
        chapter_number: parsedRef.chapterNumber,
        start_verse: parsedRef.startVerse || 1,
        end_verse: parsedRef.endVerse || 1,
        relevance_score: relevance,
      });
    }

    if (highlights.length > 0) {
      await this.repository.bulkInsertHighlights(highlights);
    }

    return highlights.length;
  }
}

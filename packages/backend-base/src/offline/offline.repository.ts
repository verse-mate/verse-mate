import { sql } from "kysely";
import type { db } from "../shared/shared.plugin";

export interface BibleVersionManifest {
  key: string;
  name: string;
  language: string;
  updated_at: string;
  size_bytes: number;
}

export interface CommentaryLanguageManifest {
  code: string;
  name: string;
  updated_at: string;
  size_bytes: number;
}

export interface TopicLanguageManifest {
  code: string;
  name: string;
  updated_at: string;
  size_bytes: number;
}

export interface OfflineManifest {
  bible_versions: BibleVersionManifest[];
  commentary_languages: CommentaryLanguageManifest[];
  topic_languages: TopicLanguageManifest[];
}

export interface BibleVerseData {
  book_id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
}

export interface CommentaryData {
  explanation_id: number;
  book_id: number;
  chapter_number: number;
  verse_start: number | null;
  verse_end: number | null;
  type: string;
  explanation: string;
  language_code: string;
}

export interface TopicData {
  topic_id: string;
  name: string;
  content: string;
  language_code: string;
  category: string;
  sort_order: number | null;
}

export interface TopicReferenceData {
  topic_id: string;
  reference_content: string;
}

export interface TopicExplanationData {
  topic_id: string;
  type: string;
  explanation: string;
  language_code: string;
}

export interface OfflineUserNote {
  note_id: string;
  book_id: number;
  chapter_number: number;
  verse_number: number | null;
  content: string;
  updated_at: string;
}

export interface OfflineUserHighlight {
  highlight_id: number;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  color: string;
  start_char: number | null;
  end_char: number | null;
  updated_at: string;
}

export interface OfflineUserBookmark {
  favorite_id: number;
  book_id: number;
  chapter_number: number;
  created_at: string;
}

export class OfflineRepository {
  constructor(private readonly db: db) {}

  /**
   * Build the offline manifest with available content and update timestamps
   */
  async buildManifest(): Promise<OfflineManifest> {
    const connection = this.db.getOrCreateConnection();

    // Get Bible versions with estimated sizes
    const bibleVersions = await connection
      .selectFrom("bible_versions")
      .select([
        "id",
        "version_key",
        "version_name as name",
        "language_code",
        sql<string>`COALESCE(created_at, NOW())`.as("updated_at"),
      ])
      .execute();

    // Calculate estimated sizes for each Bible version (count verses * avg size)
    const bibleVersionManifests: BibleVersionManifest[] = await Promise.all(
      bibleVersions.map(async (version) => {
        const verseCount = await connection
          .selectFrom("verses")
          .where("version_id", "=", version.id)
          .select((eb) => eb.fn.count("verse_id").as("count"))
          .executeTakeFirst();

        // Estimate ~100 bytes per verse on average
        const estimatedSize = Number(verseCount?.count || 0) * 100;

        return {
          key: version.version_key,
          name: version.name || version.version_key,
          language: version.language_code || "en",
          updated_at: new Date(version.updated_at).toISOString(),
          size_bytes: estimatedSize,
        };
      }),
    );

    // Get commentary languages from explanation_languages table
    const commentaryLanguages = await connection
      .selectFrom("explanation_languages")
      .where("is_enabled", "=", true)
      .select([
        "language_code",
        "name",
        "explanation_count",
        sql<string>`COALESCE(updated_at, NOW())`.as("updated_at"),
      ])
      .execute();

    const commentaryManifests: CommentaryLanguageManifest[] =
      commentaryLanguages.map((lang) => ({
        code: lang.language_code,
        name: lang.name || lang.language_code,
        updated_at: new Date(lang.updated_at).toISOString(),
        // Estimate ~500 bytes per explanation
        size_bytes: (lang.explanation_count || 0) * 500,
      }));

    // Get topic languages by checking distinct languages in topic_translations
    const topicLanguages = await connection
      .selectFrom("topic_translations")
      .select([
        "language_code",
        sql<number>`COUNT(*)`.as("topic_count"),
        sql<string>`MAX(COALESCE(updated_at, created_at, NOW()))`.as(
          "updated_at",
        ),
      ])
      .groupBy("language_code")
      .execute();

    // Also check for English originals in the topics table (not stored in topic_translations)
    const englishOriginals = await connection
      .selectFrom("topics")
      .where("is_active", "=", true)
      .select([
        sql<number>`COUNT(*)`.as("topic_count"),
        sql<string>`MAX(COALESCE(updated_at, created_at, NOW()))`.as(
          "updated_at",
        ),
      ])
      .executeTakeFirst();

    // Use Intl.DisplayNames to get language names
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

    const topicManifests: TopicLanguageManifest[] = topicLanguages.map(
      (lang) => ({
        code: lang.language_code,
        name: displayNames.of(lang.language_code) || lang.language_code,
        updated_at: new Date(lang.updated_at).toISOString(),
        // Estimate ~1000 bytes per topic
        size_bytes: Number(lang.topic_count || 0) * 1000,
      }),
    );

    // Include English if there are active topics and "en" isn't already from translations
    const hasEnglishTranslation = topicLanguages.some(
      (lang) => lang.language_code === "en",
    );
    if (
      !hasEnglishTranslation &&
      englishOriginals &&
      Number(englishOriginals.topic_count) > 0
    ) {
      topicManifests.push({
        code: "en",
        name: displayNames.of("en") || "English",
        updated_at: new Date(englishOriginals.updated_at).toISOString(),
        size_bytes: Number(englishOriginals.topic_count) * 1000,
      });
    }

    return {
      bible_versions: bibleVersionManifests,
      commentary_languages: commentaryManifests,
      topic_languages: topicManifests,
    };
  }

  /**
   * Get all verses for a specific Bible version
   */
  async getAllVerses(versionKey: string): Promise<BibleVerseData[]> {
    const connection = this.db.getOrCreateConnection();

    // First get the version ID
    const version = await connection
      .selectFrom("bible_versions")
      .where("version_key", "=", versionKey)
      .select("id")
      .executeTakeFirst();

    if (!version) {
      return [];
    }

    const verses = await connection
      .selectFrom("verses")
      .innerJoin("chapters", "chapters.chapter_id", "verses.chapter_id")
      .innerJoin("books", "books.book_id", "chapters.book_id")
      .where("verses.version_id", "=", version.id)
      .select([
        "books.book_id",
        "chapters.chapter_number",
        "verses.verse_number as verse_number",
        "verses.text",
      ])
      .orderBy("books.book_id")
      .orderBy("chapters.chapter_number")
      .orderBy("verses.verse_number")
      .execute();

    return verses.map((v) => ({
      book_id: v.book_id,
      chapter_number: v.chapter_number,
      verse_number: v.verse_number,
      text: v.text,
    }));
  }

  /**
   * Get the last updated timestamp for a Bible version
   */
  async getBibleVersionUpdatedAt(versionKey: string): Promise<Date | null> {
    const connection = this.db.getOrCreateConnection();

    const version = await connection
      .selectFrom("bible_versions")
      .where("version_key", "=", versionKey)
      .select(sql<string>`COALESCE(created_at, NOW())`.as("updated_at"))
      .executeTakeFirst();

    return version ? new Date(version.updated_at) : null;
  }

  /**
   * Get all explanations for a specific language
   */
  async getAllExplanations(languageCode: string): Promise<CommentaryData[]> {
    const connection = this.db.getOrCreateConnection();

    // Normalize language code (handle both "en" and "en-US" formats)
    const normalizedLanguageCode = languageCode.toLowerCase();
    const baseLanguageCode = normalizedLanguageCode.includes("-")
      ? normalizedLanguageCode.split("-")[0]
      : normalizedLanguageCode;

    const explanations = await connection
      .selectFrom("explanations")
      .innerJoin("chapters", "chapters.chapter_id", "explanations.chapter_id")
      .where("explanations.is_active", "=", true)
      .where((eb) =>
        eb.or([
          eb(
            eb.fn("lower", ["explanations.language_code"]),
            "=",
            normalizedLanguageCode,
          ),
          eb(
            eb.fn("lower", ["explanations.language_code"]),
            "=",
            baseLanguageCode,
          ),
        ]),
      )
      .select([
        "explanations.explanation_id",
        "chapters.book_id",
        "chapters.chapter_number",
        "explanations.type",
        "explanations.explanation",
        "explanations.language_code",
      ])
      .orderBy("chapters.book_id")
      .orderBy("chapters.chapter_number")
      .execute();

    return explanations.map((e) => ({
      explanation_id: e.explanation_id,
      book_id: e.book_id,
      chapter_number: e.chapter_number,
      verse_start: null, // Chapter-level explanations don't have verse ranges
      verse_end: null,
      type: e.type,
      explanation: e.explanation,
      language_code: e.language_code,
    }));
  }

  /**
   * Get the last updated timestamp for explanations in a language
   */
  async getCommentaryUpdatedAt(languageCode: string): Promise<Date | null> {
    const connection = this.db.getOrCreateConnection();

    const normalizedLanguageCode = languageCode.toLowerCase();
    const baseLanguageCode = normalizedLanguageCode.includes("-")
      ? normalizedLanguageCode.split("-")[0]
      : normalizedLanguageCode;

    const result = await connection
      .selectFrom("explanations")
      .where("is_active", "=", true)
      .where((eb) =>
        eb.or([
          eb(eb.fn("lower", ["language_code"]), "=", normalizedLanguageCode),
          eb(eb.fn("lower", ["language_code"]), "=", baseLanguageCode),
        ]),
      )
      .select(sql<string>`MAX(COALESCE(created_at, NOW()))`.as("updated_at"))
      .executeTakeFirst();

    return result?.updated_at ? new Date(result.updated_at) : null;
  }

  /**
   * Get all topics with their references and explanations for a specific language
   */
  async getAllTopics(languageCode: string): Promise<{
    topics: TopicData[];
    references: TopicReferenceData[];
    explanations: TopicExplanationData[];
  }> {
    const connection = this.db.getOrCreateConnection();

    // Get topics with translations, falling back to originals for English
    const topics = await connection
      .selectFrom("topics")
      .leftJoin("topic_translations", (join) =>
        join
          .onRef("topics.topic_id", "=", "topic_translations.topic_id")
          .on("topic_translations.language_code", "=", sql.lit(languageCode)),
      )
      .where("topics.is_active", "=", true)
      .where((eb) =>
        eb.or([
          eb("topic_translations.language_code", "=", languageCode),
          // Include originals when requesting English and no translation exists
          eb.and([
            eb(sql`${sql.lit(languageCode)}`, "in", sql`('en', 'en-US')`),
            eb("topic_translations.language_code", "is", null),
          ]),
        ]),
      )
      .select([
        "topics.topic_id",
        "topics.name as original_name",
        "topics.description as original_description",
        "topics.category",
        "topics.sort_order",
        "topic_translations.translated_name",
        "topic_translations.translated_description",
        "topic_translations.language_code as translation_language_code",
      ])
      .execute();

    const topicIds = topics.map((t) => t.topic_id);

    // Get topic references (raw content with verse placeholders)
    const references =
      topicIds.length > 0
        ? await connection
            .selectFrom("topic_references")
            .where("topic_id", "in", topicIds)
            .where("is_active", "=", true)
            .select(["topic_id", "content"])
            .execute()
        : [];

    // Normalize language code for explanation lookup
    const normalizedLang = languageCode.toLowerCase();
    const baseLang = normalizedLang.includes("-")
      ? normalizedLang.split("-")[0]
      : normalizedLang;

    // Get topic explanations for the requested language
    const explanations =
      topicIds.length > 0
        ? await connection
            .selectFrom("topic_explanations")
            .where("topic_id", "in", topicIds)
            .where("is_active", "=", true)
            .where((eb) =>
              eb.or([
                eb(
                  eb.fn("lower", ["language_code"]),
                  "=",
                  normalizedLang,
                ),
                eb(eb.fn("lower", ["language_code"]), "=", baseLang),
              ]),
            )
            .select(["topic_id", "type", "explanation", "language_code"])
            .execute()
        : [];

    return {
      topics: topics.map((t) => ({
        topic_id: t.topic_id,
        name: t.translated_name || t.original_name,
        content: t.translated_description || t.original_description || "",
        language_code: t.translation_language_code || languageCode,
        category: t.category,
        sort_order: t.sort_order,
      })),
      references: references.map((r) => ({
        topic_id: r.topic_id,
        reference_content: r.content,
      })),
      explanations: explanations.map((e) => ({
        topic_id: e.topic_id,
        type: e.type,
        explanation: e.explanation,
        language_code: e.language_code,
      })),
    };
  }

  /**
   * Get the last updated timestamp for topics in a language
   */
  async getTopicsUpdatedAt(languageCode: string): Promise<Date | null> {
    const connection = this.db.getOrCreateConnection();

    // For English, check the topics table directly since originals are in English
    const isEnglish = languageCode === "en" || languageCode === "en-US";

    if (isEnglish) {
      const result = await connection
        .selectFrom("topics")
        .where("is_active", "=", true)
        .select(
          sql<string>`MAX(COALESCE(updated_at, created_at, NOW()))`.as(
            "updated_at",
          ),
        )
        .executeTakeFirst();

      return result?.updated_at ? new Date(result.updated_at) : null;
    }

    const result = await connection
      .selectFrom("topic_translations")
      .where("language_code", "=", languageCode)
      .select(
        sql<string>`MAX(COALESCE(updated_at, created_at, NOW()))`.as(
          "updated_at",
        ),
      )
      .executeTakeFirst();

    return result?.updated_at ? new Date(result.updated_at) : null;
  }

  /**
   * Get all notes for a specific user
   */
  async getAllUserNotes(userId: string): Promise<OfflineUserNote[]> {
    const connection = this.db.getOrCreateConnection();

    // TODO: Remove 'as any' once notes table is added to database schema types
    const notes = await (connection as any)
      .selectFrom("notes as n")
      .innerJoin("chapters as c", "n.chapter_id", "c.chapter_id")
      .leftJoin("verses as v", "n.verse_id", "v.verse_id")
      .where("n.user_id", "=", userId)
      .select([
        "n.note_id",
        "c.book_id",
        "c.chapter_number",
        "v.verse_number",
        "n.content",
        sql<string>`COALESCE(n.updated_at, n.created_at)`.as("updated_at"),
      ])
      .execute();

    return notes.map((n: any) => ({
      note_id: n.note_id,
      book_id: n.book_id,
      chapter_number: n.chapter_number,
      verse_number: n.verse_number ?? null,
      content: n.content,
      updated_at: new Date(n.updated_at).toISOString(),
    }));
  }

  /**
   * Get all highlights for a specific user
   */
  async getAllUserHighlights(userId: string): Promise<OfflineUserHighlight[]> {
    const connection = this.db.getOrCreateConnection();

    const highlights = await connection
      .selectFrom("verse_highlights")
      .where("user_id", "=", userId)
      .selectAll()
      .execute();

    return highlights.map((h) => ({
      highlight_id: h.highlight_id,
      book_id: h.book_id,
      chapter_number: h.chapter_number,
      start_verse: h.start_verse,
      end_verse: h.end_verse,
      color: h.color || "yellow",
      start_char: h.start_char,
      end_char: h.end_char,
      updated_at: new Date(
        h.updated_at ?? h.created_at ?? new Date(),
      ).toISOString(),
    }));
  }

  /**
   * Get all bookmarks for a specific user
   */
  async getAllUserBookmarks(userId: string): Promise<OfflineUserBookmark[]> {
    const connection = this.db.getOrCreateConnection();

    // In BibleRepository.getFavorites, bookmark type is hardcoded to 'chapter'
    const bookmarks = await connection
      .selectFrom("favorites")
      .innerJoin("chapters", "favorites.chapter_id", "chapters.chapter_id")
      .where("favorites.user_id", "=", userId)
      .where("favorites.type", "=", "chapter" as any) // Assuming enum
      .select([
        "favorites.favorite_id",
        "chapters.book_id",
        "chapters.chapter_number",
      ])
      .execute();

    // Note: Favorites table doesn't have created_at in the schema I saw earlier.
    // I'll return current date if not available, or check schema again.
    // The schema packages/database/src/models/public/Favorites.ts does NOT have created_at.
    // I'll use a placeholder or check if there is a way to know.
    // For now, I'll use new Date().toISOString() as fallback, but this implies sync might be tricky.
    // Actually, Kysely types might be generated and strict.

    return bookmarks.map((b) => ({
      favorite_id: b.favorite_id,
      book_id: b.book_id,
      chapter_number: b.chapter_number,
      created_at: new Date().toISOString(), // Fallback as created_at is missing in favorites
    }));
  }
}

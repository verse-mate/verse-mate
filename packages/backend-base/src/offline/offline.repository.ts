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
}

export interface TopicReferenceData {
  topic_id: string;
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number | null;
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
          .where("version_id", "=", version.version_key)
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
      .select(
        sql<string>`COALESCE(updated_at, created_at, NOW())`.as("updated_at"),
      )
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
      .select(
        sql<string>`MAX(COALESCE(updated_at, created_at, NOW()))`.as(
          "updated_at",
        ),
      )
      .executeTakeFirst();

    return result?.updated_at ? new Date(result.updated_at) : null;
  }

  /**
   * Get all topics and their references for a specific language
   */
  async getAllTopics(
    languageCode: string,
  ): Promise<{ topics: TopicData[]; references: TopicReferenceData[] }> {
    const connection = this.db.getOrCreateConnection();

    // Get translated topics for the language
    const topics = await connection
      .selectFrom("topics")
      .innerJoin(
        "topic_translations",
        "topic_translations.topic_id",
        "topics.topic_id",
      )
      .where("topics.is_active", "=", true)
      .where("topic_translations.language_code", "=", languageCode)
      .select([
        "topics.topic_id",
        "topic_translations.translated_name as name",
        "topic_translations.translated_description as description",
        "topic_translations.language_code",
      ])
      .execute();

    // TODO: Fix topic references query. The schema for topic_references does not match the spec (missing structured verse data).
    // Currently it only has 'content' field.
    const references: any[] = [];

    return {
      topics: topics.map((t) => ({
        topic_id: t.topic_id,
        name: t.name,
        content: t.description || "",
        language_code: t.language_code,
      })),
      references: [],
    };
  }

  /**
   * Get the last updated timestamp for topics in a language
   */
  async getTopicsUpdatedAt(languageCode: string): Promise<Date | null> {
    const connection = this.db.getOrCreateConnection();

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
}

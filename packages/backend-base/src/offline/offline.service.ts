import type { cache } from "../shared/shared.plugin";
import type { ObjectStorageService } from "../shared/storage/storage.service";
import type {
  CommentaryData,
  OfflineManifest,
  OfflineRepository,
} from "./offline.repository";

export interface OfflineCommentaryEntry extends Omit<CommentaryData, "audios"> {
  audios: Array<{
    explanation_id: number;
    voice: string;
    language_code: string;
    content_hash: string;
    duration_seconds: number;
    audio_url: string;
  }>;
}

const MANIFEST_CACHE_KEY = "offline:manifest";
const MANIFEST_CACHE_TTL = 300; // 5 minutes

export class OfflineService {
  constructor(
    private readonly offlineRepository: OfflineRepository,
    private readonly cache: cache,
    private readonly storage?: ObjectStorageService,
  ) {}

  /**
   * Get the offline manifest with caching
   */
  async getManifest(): Promise<OfflineManifest> {
    // Try to get from cache
    const cached = await this.cache.get(MANIFEST_CACHE_KEY);
    if (cached) {
      return cached as OfflineManifest;
    }

    // Build manifest from database
    const manifest = await this.offlineRepository.buildManifest();

    // Cache the result
    await this.cache.set(
      MANIFEST_CACHE_KEY,
      manifest,
      `${MANIFEST_CACHE_TTL}s`,
    );

    return manifest;
  }

  /**
   * Invalidate the manifest cache (call when content is updated)
   */
  async invalidateManifestCache(): Promise<void> {
    await this.cache.delete(MANIFEST_CACHE_KEY);
  }

  /**
   * Get all verses for a Bible version
   */
  async getBibleVersionData(versionKey: string) {
    return this.offlineRepository.getAllVerses(versionKey);
  }

  /**
   * Get the last modified date for a Bible version
   */
  async getBibleVersionLastModified(versionKey: string): Promise<Date | null> {
    return this.offlineRepository.getBibleVersionUpdatedAt(versionKey);
  }

  /**
   * Check if a Bible version exists
   */
  async bibleVersionExists(versionKey: string): Promise<boolean> {
    const verses = await this.offlineRepository.getAllVerses(versionKey);
    return verses.length > 0;
  }

  /**
   * Get all commentaries for a language, including presigned audio URLs
   * for every non-stale variant (TASK-010). Each request regenerates the
   * URLs; clients cache the blobs by content_hash, not by URL.
   */
  async getCommentaryData(
    languageCode: string,
  ): Promise<OfflineCommentaryEntry[]> {
    const explanations =
      await this.offlineRepository.getAllExplanations(languageCode);
    return Promise.all(
      explanations.map(async (e) => {
        const audios = e.audios ?? [];
        const withUrls = await Promise.all(
          audios.map(async (a) => ({
            explanation_id: a.explanation_id,
            voice: a.voice,
            language_code: a.language_code,
            content_hash: a.content_hash,
            duration_seconds: a.duration_seconds,
            audio_url: this.storage
              ? await this.storage.getGlobalObjectUrl({ key: a.storage_key })
              : "",
          })),
        );
        return {
          explanation_id: e.explanation_id,
          book_id: e.book_id,
          chapter_number: e.chapter_number,
          verse_start: e.verse_start,
          verse_end: e.verse_end,
          type: e.type,
          explanation: e.explanation,
          language_code: e.language_code,
          audios: withUrls,
        };
      }),
    );
  }

  /**
   * Get the last modified date for commentaries in a language
   */
  async getCommentaryLastModified(languageCode: string): Promise<Date | null> {
    return this.offlineRepository.getCommentaryUpdatedAt(languageCode);
  }

  /**
   * Check if commentaries exist for a language
   */
  async commentaryExists(languageCode: string): Promise<boolean> {
    const explanations =
      await this.offlineRepository.getAllExplanations(languageCode);
    return explanations.length > 0;
  }

  /**
   * Get all topics for a language
   */
  async getTopicsData(languageCode: string) {
    return this.offlineRepository.getAllTopics(languageCode);
  }

  /**
   * Get the last modified date for topics in a language
   */
  async getTopicsLastModified(languageCode: string): Promise<Date | null> {
    return this.offlineRepository.getTopicsUpdatedAt(languageCode);
  }

  /**
   * Check if topics exist for a language
   */
  async topicsExist(languageCode: string): Promise<boolean> {
    const topicsData = await this.offlineRepository.getAllTopics(languageCode);
    return topicsData.topics.length > 0;
  }

  /**
   * Get all user data (notes, highlights, bookmarks)
   */
  async getUserData(userId: string) {
    const [notes, highlights, bookmarks] = await Promise.all([
      this.offlineRepository.getAllUserNotes(userId),
      this.offlineRepository.getAllUserHighlights(userId),
      this.offlineRepository.getAllUserBookmarks(userId),
    ]);

    return { notes, highlights, bookmarks };
  }
}

import { gzipSync } from "node:zlib";
import type { cache } from "../shared/shared.plugin";
import type { OfflineManifest, OfflineRepository } from "./offline.repository";

const MANIFEST_CACHE_KEY = "offline:manifest";
const MANIFEST_CACHE_TTL = 300; // 5 minutes

export class OfflineService {
  constructor(
    private readonly offlineRepository: OfflineRepository,
    private readonly cache: cache,
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
   * Get all verses for a Bible version as gzip-compressed JSON
   */
  async getBibleVersionData(versionKey: string): Promise<Buffer> {
    const verses = await this.offlineRepository.getAllVerses(versionKey);
    const jsonData = JSON.stringify(verses);
    return gzipSync(jsonData);
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
   * Get all commentaries for a language as gzip-compressed JSON
   */
  async getCommentaryData(languageCode: string): Promise<Buffer> {
    const explanations =
      await this.offlineRepository.getAllExplanations(languageCode);
    const jsonData = JSON.stringify(explanations);
    return gzipSync(jsonData);
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
   * Get all topics for a language as gzip-compressed JSON
   */
  async getTopicsData(languageCode: string): Promise<Buffer> {
    const topicsData = await this.offlineRepository.getAllTopics(languageCode);
    const jsonData = JSON.stringify(topicsData);
    return gzipSync(jsonData);
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
}

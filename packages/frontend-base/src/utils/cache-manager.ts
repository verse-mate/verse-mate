// Cache management and cleanup utilities for PWA
import { bibleCache } from "./offline-bible-cache";

interface CacheStats {
  totalSize: number;
  chapters: number;
  explanations: number;
  userProgress: number;
  lastCleanup: number;
}

interface CacheSettings {
  maxCacheSize: number; // in MB
  maxCacheAge: number; // in days
  autoCleanupEnabled: boolean;
  cleanupInterval: number; // in hours
}

class CacheManager {
  private defaultSettings: CacheSettings = {
    maxCacheSize: 50, // 50MB
    maxCacheAge: 30, // 30 days
    autoCleanupEnabled: true,
    cleanupInterval: 24, // 24 hours
  };

  private settings: CacheSettings;
  private cleanupTimer: number | null = null;

  constructor() {
    this.settings = this.loadSettings();
    if (typeof window !== "undefined") {
      this.initAutoCleanup();
    }
  }

  // Get current cache statistics
  async getCacheStats(): Promise<CacheStats> {
    const dbStats = await bibleCache.getCacheStats();
    const lastCleanup = this.getLastCleanupTime();

    return {
      totalSize: dbStats.totalSize,
      chapters: dbStats.chapters,
      explanations: dbStats.explanations,
      userProgress: dbStats.userProgress,
      lastCleanup,
    };
  }

  // Get cache settings
  getSettings(): CacheSettings {
    return { ...this.settings };
  }

  // Update cache settings
  updateSettings(newSettings: Partial<CacheSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();

    // Restart auto cleanup if settings changed
    if (
      newSettings.autoCleanupEnabled !== undefined ||
      newSettings.cleanupInterval !== undefined
    ) {
      this.initAutoCleanup();
    }
  }

  // Manual cache cleanup
  async cleanupCache(): Promise<{
    itemsRemoved: number;
    spaceFreed: number;
  }> {
    console.log("🧹 Starting cache cleanup...");

    const beforeStats = await this.getCacheStats();

    // Clear expired cache entries
    await bibleCache.clearExpiredCache();

    // Remove oldest entries if cache is too large
    await this.cleanupBySizeLimit();

    const afterStats = await this.getCacheStats();

    const itemsRemoved =
      beforeStats.chapters +
      beforeStats.explanations -
      (afterStats.chapters + afterStats.explanations);
    const spaceFreed = beforeStats.totalSize - afterStats.totalSize;

    this.setLastCleanupTime(Date.now());

    console.log(
      `✨ Cache cleanup complete: ${itemsRemoved} items removed, ${spaceFreed}KB freed`,
    );

    return {
      itemsRemoved,
      spaceFreed,
    };
  }

  // Clear all cache data
  async clearAllCache(): Promise<void> {
    console.log("🗑️ Clearing all cache data...");

    // This would require additional methods in bibleCache to clear all stores
    const db = await bibleCache.init();
    const transaction = db.transaction(
      ["chapters", "explanations", "booksMetadata", "testaments"],
      "readwrite",
    );

    await Promise.all([
      this.clearObjectStore(transaction.objectStore("chapters")),
      this.clearObjectStore(transaction.objectStore("explanations")),
      this.clearObjectStore(transaction.objectStore("booksMetadata")),
      this.clearObjectStore(transaction.objectStore("testaments")),
    ]);

    console.log("✅ All cache data cleared");
  }

  // Get formatted cache size string
  formatCacheSize(sizeInBytes: number): string {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    }
    if (sizeInBytes < 1024 * 1024) {
      return `${Math.round(sizeInBytes / 1024)} KB`;
    }
    return `${Math.round((sizeInBytes / (1024 * 1024)) * 100) / 100} MB`;
  }

  // Check if cache cleanup is needed
  async shouldCleanup(): Promise<boolean> {
    const stats = await this.getCacheStats();
    const maxSizeBytes = this.settings.maxCacheSize * 1024 * 1024;
    const maxAgeMs = this.settings.maxCacheAge * 24 * 60 * 60 * 1000;
    const timeSinceLastCleanup = Date.now() - stats.lastCleanup;

    return stats.totalSize > maxSizeBytes || timeSinceLastCleanup > maxAgeMs;
  }

  // Get cache health status
  async getCacheHealth(): Promise<{
    status: "healthy" | "warning" | "critical";
    message: string;
    recommendations: string[];
  }> {
    const stats = await this.getCacheStats();
    const maxSizeBytes = this.settings.maxCacheSize * 1024 * 1024;
    const sizePercentage = (stats.totalSize / maxSizeBytes) * 100;

    const recommendations: string[] = [];

    if (sizePercentage > 90) {
      recommendations.push("Consider clearing old cached content");
      recommendations.push("Increase cache size limit in settings");
      return {
        status: "critical",
        message: "Cache is nearly full and may impact performance",
        recommendations,
      };
    }
    if (sizePercentage > 70) {
      recommendations.push("Cache cleanup recommended");
      return {
        status: "warning",
        message: "Cache is getting large, cleanup recommended",
        recommendations,
      };
    }
    return {
      status: "healthy",
      message: "Cache is operating normally",
      recommendations: [],
    };
  }

  // Export cache data for backup
  async exportCacheData(): Promise<string> {
    // This would export important cached data as JSON
    const stats = await this.getCacheStats();
    const exportData = {
      timestamp: Date.now(),
      stats,
      settings: this.settings,
      // Note: In a real implementation, you'd include the actual cached data
      metadata: {
        version: "1.0",
        app: "VerseMate",
      },
    };

    return JSON.stringify(exportData, null, 2);
  }

  private async cleanupBySizeLimit() {
    const maxSizeBytes = this.settings.maxCacheSize * 1024 * 1024;
    const currentStats = await this.getCacheStats();

    if (currentStats.totalSize <= maxSizeBytes) {
      return;
    }

    console.log(
      `🧹 Cache size (${this.formatCacheSize(currentStats.totalSize)}) exceeds limit (${this.formatCacheSize(maxSizeBytes)}), removing oldest entries...`,
    );

    // This is a simplified implementation
    // In practice, you'd query the oldest entries and remove them selectively
    await bibleCache.clearExpiredCache();
  }

  private async clearObjectStore(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private initAutoCleanup() {
    // Clear existing timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Set up new timer if auto cleanup is enabled
    if (this.settings.autoCleanupEnabled) {
      const intervalMs = this.settings.cleanupInterval * 60 * 60 * 1000; // Convert hours to ms

      this.cleanupTimer = window.setInterval(async () => {
        const shouldCleanup = await this.shouldCleanup();
        if (shouldCleanup) {
          await this.cleanupCache();
        }
      }, intervalMs) as unknown as number;

      console.log(
        `🔄 Auto cleanup enabled (every ${this.settings.cleanupInterval} hours)`,
      );
    }
  }

  private loadSettings(): CacheSettings {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return { ...this.defaultSettings };
    }

    try {
      const stored = localStorage.getItem("verse-mate-cache-settings");
      if (stored) {
        return { ...this.defaultSettings, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Failed to load cache settings:", error);
    }
    return { ...this.defaultSettings };
  }

  private saveSettings() {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem(
        "verse-mate-cache-settings",
        JSON.stringify(this.settings),
      );
    } catch (error) {
      console.error("Failed to save cache settings:", error);
    }
  }

  private getLastCleanupTime(): number {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return 0;
    }

    try {
      const stored = localStorage.getItem("verse-mate-last-cleanup");
      return stored ? Number.parseInt(stored, 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  private setLastCleanupTime(timestamp: number) {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem("verse-mate-last-cleanup", timestamp.toString());
    } catch (error) {
      console.error("Failed to save last cleanup time:", error);
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();

// Utility functions
export const getCacheStats = () => cacheManager.getCacheStats();
export const cleanupCache = () => cacheManager.cleanupCache();
export const clearAllCache = () => cacheManager.clearAllCache();
export const getCacheHealth = () => cacheManager.getCacheHealth();
export const formatCacheSize = (sizeInBytes: number) =>
  cacheManager.formatCacheSize(sizeInBytes);
export const getCacheSettings = () => cacheManager.getSettings();
export const updateCacheSettings = (settings: Partial<CacheSettings>) =>
  cacheManager.updateSettings(settings);

export type { CacheStats, CacheSettings };

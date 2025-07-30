// Bible content caching utilities for offline access
export interface BibleChapter {
  bookId: number;
  chapterNumber: number;
  name: string;
  testament: string;
  genre: {
    g: number;
    n: string;
  };
  chapters: Array<{
    chapterNumber: number;
    subtitles: any[];
    verses: any[];
  }>;
  cachedAt: number;
}

export interface BibleExplanation {
  bookId: number;
  chapterNumber: number;
  explanations: Array<{
    book_id: number;
    chapter_number: number;
    explanation_id: number | null;
    type: string | null;
    explanation: string | null;
  }>;
  cachedAt: number;
}

export interface UserProgress {
  userId: string;
  bookId: number;
  chapterNumber: number;
  lastRead: number;
  syncedAt: number;
}

class BibleCacheDB {
  private dbName = "VerseMateOfflineDB";
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Bible chapters store
        if (!db.objectStoreNames.contains("chapters")) {
          const chaptersStore = db.createObjectStore("chapters", {
            keyPath: ["bookId", "chapterNumber"],
          });
          chaptersStore.createIndex("bookId", "bookId", { unique: false });
          chaptersStore.createIndex("cachedAt", "cachedAt", { unique: false });
        }

        // Bible explanations store
        if (!db.objectStoreNames.contains("explanations")) {
          const explanationsStore = db.createObjectStore("explanations", {
            keyPath: ["bookId", "chapterNumber"],
          });
          explanationsStore.createIndex("bookId", "bookId", { unique: false });
        }

        // User progress store
        if (!db.objectStoreNames.contains("userProgress")) {
          const progressStore = db.createObjectStore("userProgress", {
            keyPath: ["userId", "bookId", "chapterNumber"],
          });
          progressStore.createIndex("userId", "userId", { unique: false });
          progressStore.createIndex("lastRead", "lastRead", { unique: false });
        }

        // Books metadata store
        if (!db.objectStoreNames.contains("booksMetadata")) {
          db.createObjectStore("booksMetadata", { keyPath: "id" });
        }

        // Testaments store
        if (!db.objectStoreNames.contains("testaments")) {
          db.createObjectStore("testaments", { keyPath: "id" });
        }
      };
    });
  }

  async cacheChapter(chapter: BibleChapter): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(["chapters"], "readwrite");
    const store = transaction.objectStore("chapters");

    const chapterWithTimestamp = {
      ...chapter,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(chapterWithTimestamp);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedChapter(
    bookId: number,
    chapterNumber: number,
  ): Promise<BibleChapter | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const db = await this.init();
    const transaction = db.transaction(["chapters"], "readonly");
    const store = transaction.objectStore("chapters");

    return new Promise((resolve, reject) => {
      const request = store.get([bookId, chapterNumber]);
      request.onsuccess = () => {
        const result = request.result;
        if (result && this.isCacheValid(result.cachedAt, 24 * 60 * 60 * 1000)) {
          // 24 hours
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cacheExplanation(explanation: BibleExplanation): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(["explanations"], "readwrite");
    const store = transaction.objectStore("explanations");

    const explanationWithTimestamp = {
      ...explanation,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(explanationWithTimestamp);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedExplanation(
    bookId: number,
    chapterNumber: number,
  ): Promise<BibleExplanation | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const db = await this.init();
    const transaction = db.transaction(["explanations"], "readonly");
    const store = transaction.objectStore("explanations");

    return new Promise((resolve, reject) => {
      const request = store.get([bookId, chapterNumber]);
      request.onsuccess = () => {
        const result = request.result;
        if (
          result &&
          this.isCacheValid(result.cachedAt, 7 * 24 * 60 * 60 * 1000)
        ) {
          // 7 days
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveUserProgress(progress: UserProgress): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(["userProgress"], "readwrite");
    const store = transaction.objectStore("userProgress");

    return new Promise((resolve, reject) => {
      const request = store.put(progress);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUserProgress(userId: string): Promise<UserProgress[]> {
    if (typeof window === "undefined") {
      return [];
    }

    const db = await this.init();
    const transaction = db.transaction(["userProgress"], "readonly");
    const store = transaction.objectStore("userProgress");
    const index = store.index("userId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedChaptersForBook(bookId: number): Promise<BibleChapter[]> {
    if (typeof window === "undefined") {
      return [];
    }

    const db = await this.init();
    const transaction = db.transaction(["chapters"], "readonly");
    const store = transaction.objectStore("chapters");
    const index = store.index("bookId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(bookId);
      request.onsuccess = () => {
        const results = request.result || [];
        // Filter out expired cache entries
        const validResults = results.filter((chapter) =>
          this.isCacheValid(chapter.cachedAt, 24 * 60 * 60 * 1000),
        );
        resolve(validResults);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cacheBooks(books: any[]): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(["booksMetadata"], "readwrite");
    const store = transaction.objectStore("booksMetadata");

    return new Promise((resolve, reject) => {
      const request = store.put({
        id: "allBooks",
        data: books,
        cachedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedBooks(): Promise<any[] | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const db = await this.init();
    const transaction = db.transaction(["booksMetadata"], "readonly");
    const store = transaction.objectStore("booksMetadata");

    return new Promise((resolve, reject) => {
      const request = store.get("allBooks");
      request.onsuccess = () => {
        const result = request.result;
        if (
          result &&
          this.isCacheValid(result.cachedAt, 7 * 24 * 60 * 60 * 1000)
        ) {
          // 7 days
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cacheTestaments(testaments: any): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(["testaments"], "readwrite");
    const store = transaction.objectStore("testaments");

    return new Promise((resolve, reject) => {
      const request = store.put({
        id: "allTestaments",
        data: testaments,
        cachedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedTestaments(): Promise<any | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const db = await this.init();
    const transaction = db.transaction(["testaments"], "readonly");
    const store = transaction.objectStore("testaments");

    return new Promise((resolve, reject) => {
      const request = store.get("allTestaments");
      request.onsuccess = () => {
        const result = request.result;
        if (
          result &&
          this.isCacheValid(result.cachedAt, 7 * 24 * 60 * 60 * 1000)
        ) {
          // 7 days
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredCache(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    const db = await this.init();
    const transaction = db.transaction(
      ["chapters", "explanations"],
      "readwrite",
    );

    // Clear expired chapters
    const chaptersStore = transaction.objectStore("chapters");
    const chaptersIndex = chaptersStore.index("cachedAt");
    const expiredTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const chaptersRequest = chaptersIndex.openCursor(
      IDBKeyRange.upperBound(expiredTime),
    );
    chaptersRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Clear expired explanations
    const explanationsStore = transaction.objectStore("explanations");
    const explanationsRequest = explanationsStore.getAll();
    explanationsRequest.onsuccess = () => {
      const explanations = explanationsRequest.result;
      explanations.forEach((explanation) => {
        if (!this.isCacheValid(explanation.cachedAt, 7 * 24 * 60 * 60 * 1000)) {
          explanationsStore.delete([
            explanation.bookId,
            explanation.chapterNumber,
          ]);
        }
      });
    };
  }

  async getCacheStats(): Promise<{
    chapters: number;
    explanations: number;
    userProgress: number;
    totalSize: number;
  }> {
    if (typeof window === "undefined") {
      return { chapters: 0, explanations: 0, userProgress: 0, totalSize: 0 };
    }

    const db = await this.init();
    const transaction = db.transaction(
      ["chapters", "explanations", "userProgress"],
      "readonly",
    );

    const chaptersCount = await this.getStoreCount(
      transaction.objectStore("chapters"),
    );
    const explanationsCount = await this.getStoreCount(
      transaction.objectStore("explanations"),
    );
    const userProgressCount = await this.getStoreCount(
      transaction.objectStore("userProgress"),
    );

    // Estimate storage usage (rough calculation)
    const totalSize =
      (chaptersCount * 10 + explanationsCount * 5 + userProgressCount * 1) *
      1024; // KB

    return {
      chapters: chaptersCount,
      explanations: explanationsCount,
      userProgress: userProgressCount,
      totalSize,
    };
  }

  private async getStoreCount(store: IDBObjectStore): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private isCacheValid(cachedAt: number, maxAge: number): boolean {
    return Date.now() - cachedAt < maxAge;
  }
}

// Singleton instance
export const bibleCache = new BibleCacheDB();

// Utility functions for easy use
export const cacheBibleChapter = (chapter: BibleChapter) =>
  bibleCache.cacheChapter(chapter);
export const getCachedBibleChapter = (bookId: number, chapterNumber: number) =>
  bibleCache.getCachedChapter(bookId, chapterNumber);
export const cacheBibleExplanation = (explanation: BibleExplanation) =>
  bibleCache.cacheExplanation(explanation);
export const getCachedBibleExplanation = (
  bookId: number,
  chapterNumber: number,
) => bibleCache.getCachedExplanation(bookId, chapterNumber);
export const saveUserProgressOffline = (progress: UserProgress) =>
  bibleCache.saveUserProgress(progress);
export const getUserProgressOffline = (userId: string) =>
  bibleCache.getUserProgress(userId);

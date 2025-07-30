// Data synchronization utilities for offline/online mode transitions
import {
  bibleCache,
  getUserProgressOffline,
  saveUserProgressOffline,
} from "./offline-bible-cache";

interface SyncQueueItem {
  id: string;
  type: "user_progress" | "rating" | "chat_message" | "last_read";
  data: any;
  timestamp: number;
  retries: number;
}

interface SyncApiMethods {
  syncUserProgress: (data: any) => Promise<any>;
  syncRating: (data: any) => Promise<any>;
  syncChatMessage: (data: any) => Promise<any>;
  syncLastRead: (data: any) => Promise<any>;
}

class OfflineSyncManager {
  private syncQueue: SyncQueueItem[] = [];
  private isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private isSyncing = false;
  private maxRetries = 3;
  private syncCallbacks: ((
    status: "syncing" | "complete" | "error",
  ) => void)[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.initSync();
      this.loadSyncQueue();
    }
  }

  private initSync() {
    // Listen for online/offline events
    window.addEventListener("online", this.handleOnline.bind(this));
    window.addEventListener("offline", this.handleOffline.bind(this));

    // Initialize online status
    this.isOnline = navigator.onLine;
  }

  private handleOnline() {
    this.isOnline = true;
    console.log("📶 Back online - starting sync...");
    this.startSync();
  }

  private handleOffline() {
    this.isOnline = false;
    console.log("📵 Gone offline - queuing changes for sync...");
  }

  // Add item to sync queue
  addToSyncQueue(type: SyncQueueItem["type"], data: any): string {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueItem: SyncQueueItem = {
      id,
      type,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    this.syncQueue.push(queueItem);
    this.saveSyncQueue();

    console.log(`📝 Added ${type} to sync queue:`, queueItem);

    // If online, start sync immediately
    if (this.isOnline && !this.isSyncing) {
      this.startSync();
    }

    return id;
  }

  // Start synchronization process
  async startSync(apiMethods?: SyncApiMethods) {
    if (!this.isOnline || this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    this.notifyCallbacks("syncing");

    console.log(`🔄 Starting sync of ${this.syncQueue.length} items...`);

    const itemsToSync = [...this.syncQueue];
    let syncErrors = 0;

    for (const item of itemsToSync) {
      try {
        await this.syncItem(item, apiMethods);

        // Remove successfully synced item
        this.syncQueue = this.syncQueue.filter(
          (queueItem) => queueItem.id !== item.id,
        );
        console.log(`✅ Synced ${item.type} successfully`);
      } catch (error) {
        console.error(`❌ Failed to sync ${item.type}:`, error);

        // Increment retry count
        const queueItem = this.syncQueue.find((q) => q.id === item.id);
        if (queueItem) {
          queueItem.retries++;

          // Remove if max retries exceeded
          if (queueItem.retries >= this.maxRetries) {
            this.syncQueue = this.syncQueue.filter((q) => q.id !== item.id);
            console.error(
              `💀 Removing ${item.type} from sync queue - max retries exceeded`,
            );
          }
        }

        syncErrors++;
      }
    }

    this.saveSyncQueue();
    this.isSyncing = false;

    if (syncErrors === 0) {
      console.log("✨ Sync completed successfully");
      this.notifyCallbacks("complete");
    } else {
      console.warn(`⚠️ Sync completed with ${syncErrors} errors`);
      this.notifyCallbacks("error");
    }
  }

  private async syncItem(item: SyncQueueItem, apiMethods?: SyncApiMethods) {
    if (!apiMethods) {
      throw new Error("API methods not provided for sync");
    }

    switch (item.type) {
      case "user_progress":
        return await apiMethods.syncUserProgress(item.data);

      case "rating":
        return await apiMethods.syncRating(item.data);

      case "chat_message":
        return await apiMethods.syncChatMessage(item.data);

      case "last_read":
        return await apiMethods.syncLastRead(item.data);

      default:
        throw new Error(`Unknown sync type: ${item.type}`);
    }
  }

  // Save user progress for later sync
  async saveUserProgressForSync(
    userId: string,
    bookId: number,
    chapterNumber: number,
  ) {
    const progressData = {
      userId,
      bookId,
      chapterNumber,
      lastRead: Date.now(),
      syncedAt: 0, // Mark as not synced
    };

    // Save to IndexedDB
    await saveUserProgressOffline(progressData);

    // Add to sync queue if offline
    if (!this.isOnline) {
      this.addToSyncQueue("user_progress", progressData);
    }

    return progressData;
  }

  // Save rating for later sync
  saveRatingForSync(ratingData: any) {
    if (!this.isOnline) {
      this.addToSyncQueue("rating", ratingData);
    }
    return ratingData;
  }

  // Save chat message for later sync
  saveChatMessageForSync(messageData: any) {
    if (!this.isOnline) {
      this.addToSyncQueue("chat_message", messageData);
    }
    return messageData;
  }

  // Save last read chapter for later sync
  saveLastReadForSync(lastReadData: any) {
    if (!this.isOnline) {
      this.addToSyncQueue("last_read", lastReadData);
    }
    return lastReadData;
  }

  // Get sync queue status
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      queueLength: this.syncQueue.length,
      pendingItems: this.syncQueue.map((item) => ({
        type: item.type,
        timestamp: item.timestamp,
        retries: item.retries,
      })),
    };
  }

  // Subscribe to sync status changes
  onSyncStatusChange(
    callback: (status: "syncing" | "complete" | "error") => void,
  ) {
    this.syncCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyCallbacks(status: "syncing" | "complete" | "error") {
    this.syncCallbacks.forEach((callback) => callback(status));
  }

  // Persist sync queue to localStorage
  private saveSyncQueue() {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem(
        "verse-mate-sync-queue",
        JSON.stringify(this.syncQueue),
      );
    } catch (error) {
      console.error("Failed to save sync queue:", error);
    }
  }

  // Load sync queue from localStorage
  private loadSyncQueue() {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const stored = localStorage.getItem("verse-mate-sync-queue");
      if (stored) {
        this.syncQueue = JSON.parse(stored);
        console.log(`📦 Loaded ${this.syncQueue.length} items from sync queue`);
      }
    } catch (error) {
      console.error("Failed to load sync queue:", error);
      this.syncQueue = [];
    }
  }

  // Clear sync queue (for testing/debugging)
  clearSyncQueue() {
    this.syncQueue = [];
    this.saveSyncQueue();
    console.log("🗑️ Sync queue cleared");
  }

  // Force sync now (for testing)
  forceSyncNow(apiMethods?: SyncApiMethods) {
    console.log("🚀 Force sync triggered");
    return this.startSync(apiMethods);
  }
}

// Singleton instance
export const syncManager = new OfflineSyncManager();

// Utility functions for easier use
export const addToSyncQueue = (type: SyncQueueItem["type"], data: any) =>
  syncManager.addToSyncQueue(type, data);

export const saveUserProgressForSync = (
  userId: string,
  bookId: number,
  chapterNumber: number,
) => syncManager.saveUserProgressForSync(userId, bookId, chapterNumber);

export const saveRatingForSync = (ratingData: any) =>
  syncManager.saveRatingForSync(ratingData);

export const saveChatMessageForSync = (messageData: any) =>
  syncManager.saveChatMessageForSync(messageData);

export const saveLastReadForSync = (lastReadData: any) =>
  syncManager.saveLastReadForSync(lastReadData);

export const getSyncStatus = () => syncManager.getSyncStatus();

export const onSyncStatusChange = (
  callback: (status: "syncing" | "complete" | "error") => void,
) => syncManager.onSyncStatusChange(callback);

export const startSync = (apiMethods?: SyncApiMethods) =>
  syncManager.startSync(apiMethods);

export const forceSyncNow = (apiMethods?: SyncApiMethods) =>
  syncManager.forceSyncNow(apiMethods);

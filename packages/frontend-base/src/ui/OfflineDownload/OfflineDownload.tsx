import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useOfflineBookManager } from "../../hooks/useOfflineBible";
import { Button } from "../Button/Button";
import { ProgressBar } from "../ProgressBar";
import styles from "./OfflineDownload.module.css";

interface OfflineDownloadProps {
  bookId: number;
  bookName: string;
  totalChapters: number;
  className?: string;
}

export function OfflineDownload({
  bookId,
  bookName,
  totalChapters,
  className = "",
}: OfflineDownloadProps) {
  const { isOffline } = useNetworkStatus();
  const {
    downloadBookForOffline,
    isDownloading,
    getOfflineProgress,
    getCachedChaptersCount,
  } = useOfflineBookManager();
  const [cachedChapters, setCachedChapters] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const progress = getOfflineProgress(bookId);

  const fetchChapterFunction = useCallback(
    async (chapterNumber: number) => {
      const parsedBookId = String(bookId).padStart(2, "0");
      const parsedChapterId = String(chapterNumber).padStart(2, "0");

      const response = await api.bible
        .book({ bookId: parsedBookId })({ chapterNumber: parsedChapterId })
        .get();
      return response.data?.book;
    },
    [bookId],
  );

  // Load cached chapters count on component mount
  useEffect(() => {
    getCachedChaptersCount(bookId).then(setCachedChapters);
  }, [bookId, getCachedChaptersCount]);

  const handleDownload = useCallback(async () => {
    if (isOffline) {
      setError("Cannot download while offline");
      return;
    }

    setError(null);

    try {
      await downloadBookForOffline(bookId, totalChapters, fetchChapterFunction);
      const newCachedCount = await getCachedChaptersCount(bookId);
      setCachedChapters(newCachedCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }, [
    bookId,
    totalChapters,
    fetchChapterFunction,
    downloadBookForOffline,
    getCachedChaptersCount,
    isOffline,
  ]);

  const isFullyDownloaded = cachedChapters >= totalChapters;
  const isPartiallyDownloaded =
    cachedChapters > 0 && cachedChapters < totalChapters;

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <div className={styles.bookInfo}>
          <h3 className={styles.bookName}>{bookName}</h3>
          <div className={styles.chapterInfo}>
            {isFullyDownloaded ? (
              <span className={styles.statusComplete}>
                ✓ All {totalChapters} chapters available offline
              </span>
            ) : isPartiallyDownloaded ? (
              <span className={styles.statusPartial}>
                {cachedChapters} of {totalChapters} chapters cached
              </span>
            ) : (
              <span className={styles.statusNone}>
                {totalChapters} chapters available for download
              </span>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          {isDownloading ? (
            <div className={styles.downloadProgress}>
              <ProgressBar.Root>
                <ProgressBar.IndicatorBackground>
                  <ProgressBar.Indicator value={progress} />
                </ProgressBar.IndicatorBackground>
              </ProgressBar.Root>
              <span className={styles.progressText}>{progress}%</span>
            </div>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={isOffline || isFullyDownloaded}
              variant={isFullyDownloaded ? "outlined" : "contained"}
            >
              {isFullyDownloaded ? (
                <>
                  <DownloadedIcon />
                  Downloaded
                </>
              ) : isPartiallyDownloaded ? (
                <>
                  <DownloadIcon />
                  Continue Download
                </>
              ) : (
                <>
                  <DownloadIcon />
                  Download for Offline
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <ErrorIcon />
          {error}
        </div>
      )}

      {isOffline && (
        <div className={styles.offlineNotice}>
          <OfflineIcon />
          You're offline. Connect to internet to download more content.
        </div>
      )}
    </div>
  );
}

// Simple SVG icons
function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Download"
    >
      <title>Download</title>
      <path d="M8 12L3 7h3V1h4v6h3l-5 5z" />
      <path d="M1 14h14v1H1v-1z" />
    </svg>
  );
}

function DownloadedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Downloaded"
    >
      <title>Downloaded</title>
      <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 6L7 10.5 4.5 8 6 6.5l1 1 3.5-3.5L12 5.5z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Error"
    >
      <title>Error</title>
      <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM7 4h2v5H7V4zm0 6h2v2H7v-2z" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Offline"
    >
      <title>Offline</title>
      <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 6L10 7.5 8.5 6 7 7.5 5.5 6 4 7.5 5.5 9 4 10.5 5.5 12 7 10.5 8.5 12 10 10.5 11.5 12 13 10.5 11.5 9 13 7.5 11.5 6z" />
    </svg>
  );
}

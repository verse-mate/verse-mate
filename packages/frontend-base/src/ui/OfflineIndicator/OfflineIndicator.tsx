import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import styles from "./OfflineIndicator.module.css";

interface OfflineIndicatorProps {
  className?: string;
  showWhenOnline?: boolean;
  position?: "top" | "bottom" | "inline";
}

export function OfflineIndicator({
  className = "",
  showWhenOnline = false,
  position = "top",
}: OfflineIndicatorProps) {
  const { isOnline, isOffline, wasOffline, connectionType } =
    useNetworkStatus();

  // Don't render anything on server-side to avoid hydration mismatch
  if (typeof window === "undefined") {
    return null;
  }

  // Don't show anything if online and showWhenOnline is false
  if (isOnline && !showWhenOnline) {
    return null;
  }

  return (
    <div
      className={`${styles.indicator} ${styles[position]} ${className} ${
        isOffline ? styles.offline : styles.online
      }`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.content}>
        <div className={styles.statusIcon}>
          {isOffline ? (
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
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-label="Online"
            >
              <title>Online</title>
              <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm6.5 8c0 1.5-.5 2.9-1.3 4L6 4.8c1.1-.8 2.5-1.3 4-1.3 3.6 0 6.5 2.9 6.5 6.5z" />
            </svg>
          )}
        </div>

        <div className={styles.statusText}>
          {isOffline ? (
            <>
              <span className={styles.statusLabel}>Offline</span>
              <span className={styles.statusMessage}>Using cached content</span>
            </>
          ) : (
            <>
              <span className={styles.statusLabel}>Online</span>
              {wasOffline && (
                <span className={styles.statusMessage}>
                  Back online - syncing...
                </span>
              )}
              {connectionType && (
                <span className={styles.connectionType}>{connectionType}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

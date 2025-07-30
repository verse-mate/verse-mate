import { useEffect, useState } from "react";

interface OfflineStatus {
  isOnline: boolean;
  isOffline: boolean;
  wasOffline: boolean;
  connectionType?: string;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(true); // Default to online to avoid hydration issues
  const [wasOffline, setWasOffline] = useState(false);
  const [connectionType, setConnectionType] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Mark as client-side to avoid hydration mismatch
    setIsClient(true);

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      console.log("useOfflineStatus: navigator.onLine =", online);

      if (!online && isOnline) {
        setWasOffline(true);
      }

      setIsOnline(online);

      // Get connection info if available
      if ("connection" in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          setConnectionType(
            connection.effectiveType || connection.type || "unknown",
          );
        }
      }
    };

    // Initial check
    updateOnlineStatus();

    // Listen for online/offline events
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Listen for connection changes if supported
    if ("connection" in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener("change", updateOnlineStatus);
      }
    }

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);

      if ("connection" in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.removeEventListener("change", updateOnlineStatus);
        }
      }
    };
  }, [isOnline]);

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
    connectionType,
  };
}

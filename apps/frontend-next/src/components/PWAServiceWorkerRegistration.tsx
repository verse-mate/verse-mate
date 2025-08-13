"use client";

import { useEffect } from "react";

// Extend window interface for workbox
declare global {
  interface Window {
    workbox?: {
      register: () => Promise<ServiceWorkerRegistration>;
    };
  }
}

export function PWAServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if ("serviceWorker" in navigator) {
      // Register service worker using workbox
      if (
        typeof window !== "undefined" &&
        "workbox" in window &&
        window.workbox
      ) {
        window.workbox
          .register()
          .then(() => {
            console.log("[PWA] ✅ Service worker registered successfully");
          })
          .catch((error: unknown) => {
            console.error(
              "[PWA] ❌ Service worker registration failed:",
              error,
            );
          });
      }

      // Network status monitoring
      const updateNetworkStatus = async () => {
        try {
          const response = await fetch("/manifest.json", {
            method: "HEAD",
            cache: "no-cache",
            signal: AbortSignal.timeout(3000),
          });

          if (response.ok) {
            console.log(
              "[PWA] 🟢 Online - network requests will be attempted first",
            );
          } else {
            console.log("[PWA] 🔴 Offline - serving content from cache");
          }
        } catch {
          console.log("[PWA] 🔴 Offline - serving content from cache");
        }
      };

      // Monitor network changes
      window.addEventListener("online", updateNetworkStatus);
      window.addEventListener("offline", updateNetworkStatus);

      // Check initial network status
      updateNetworkStatus();

      // Cleanup event listeners
      return () => {
        window.removeEventListener("online", updateNetworkStatus);
        window.removeEventListener("offline", updateNetworkStatus);
      };
    }
  }, []);

  return null; // This component doesn't render anything
}

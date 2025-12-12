"use client";

import { getBookSlug } from "frontend-base";
import { useEffect, useState } from "react";

interface AutoOpenHandlerProps {
  bookId: number;
  chapterNumber: number;
}

export function AutoOpenHandler({
  bookId,
  chapterNumber,
}: AutoOpenHandlerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Check if deep linking is enabled via environment variable
  const isDeepLinkingEnabled =
    process.env.NEXT_PUBLIC_DEEP_LINKING_ENABLED === "true";

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobile = /iphone|ipad|ipod|android/.test(userAgent);
    setIsMobile(mobile);

    // Exit early if deep linking is disabled or not on mobile
    if (!isDeepLinkingEnabled || !mobile) return;

    // Check if we've already attempted to open the app in this browser session
    // This prevents the redirect from happening on every chapter navigation
    const hasAttempted = sessionStorage.getItem("vm_app_open_attempted");
    if (hasAttempted) return; // User chose to stay on web, respect that choice

    // Wait 2.5 seconds before attempting app open
    const timer = setTimeout(() => {
      setAttempted(true);

      // Mark that we've attempted to open the app in this session
      // This prevents repeated attempts as user navigates between chapters
      sessionStorage.setItem("vm_app_open_attempted", "true");

      const bookSlug = getBookSlug(bookId) || bookId.toString();
      const path = `/bible/${bookSlug}/${chapterNumber}`;

      const ua = navigator.userAgent.toLowerCase();
      const isAndroid = /android/.test(ua);
      const isIOS = /iphone|ipad|ipod/.test(ua);

      try {
        if (isAndroid) {
          // Prefer intent for Android to avoid stuck states
          const intentUrl = `intent://app.versemate.org${path}#Intent;scheme=https;package=org.versemate.mobile;end`;
          window.location.href = intentUrl;
        } else if (isIOS) {
          // iOS: navigate to https link (Universal Link). If it fails, quickly return without leaving blank page.
          const start = Date.now();
          window.location.href = `https://app.versemate.org${path}`;
          // Fallback: after 1s, if still here, do nothing (stay on web)
          setTimeout(() => {
            if (Date.now() - start < 1100) {
              // still in browser; no-op to keep user on this page
            }
          }, 1000);
        } else {
          window.location.href = `https://app.versemate.org${path}`;
        }
      } catch {
        // Swallow errors and keep user on web
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [bookId, chapterNumber, isDeepLinkingEnabled]);

  // Don't render anything if deep linking is disabled, not on mobile, or not attempted yet
  if (!isDeepLinkingEnabled || !isMobile || !attempted) return null;

  return (
    <div className="auto-open-status">
      <p>Opening VerseMate...</p>
    </div>
  );
}

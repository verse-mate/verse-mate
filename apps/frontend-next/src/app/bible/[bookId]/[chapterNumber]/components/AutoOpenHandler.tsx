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

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobile = /iphone|ipad|ipod|android/.test(userAgent);
    setIsMobile(mobile);

    if (!mobile) return; // Desktop users stay on page

    // Wait 2.5 seconds before attempting app open
    const timer = setTimeout(() => {
      setAttempted(true);

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
  }, [bookId, chapterNumber]);

  // Don't render anything on desktop
  if (!isMobile) return null;

  return (
    <div className="auto-open-status">
      <p>
        {attempted ? "Opening VerseMate..." : "Get ready to read in the app!"}
      </p>
    </div>
  );
}

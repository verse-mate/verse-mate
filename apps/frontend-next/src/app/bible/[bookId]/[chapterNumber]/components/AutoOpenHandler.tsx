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

      // Get slug for app URL
      const bookSlug = getBookSlug(bookId) || bookId.toString();
      const appUrl = `https://app.versemate.org/bible/${bookSlug}/${chapterNumber}`;

      // Attempt to open app via Universal/App Link
      // Note: If app doesn't open, user stays on this page (which is the full reader)
      window.location.href = appUrl;
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

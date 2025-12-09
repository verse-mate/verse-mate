"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface AutoOpenHandlerProps {
  bookId: number;
  chapterNumber: number;
}

export function AutoOpenHandler({
  bookId,
  chapterNumber,
}: AutoOpenHandlerProps) {
  const router = useRouter();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android/.test(userAgent);

    if (!isMobile) return; // Desktop users stay on page

    // Wait 2.5 seconds before attempting app open
    const timer = setTimeout(() => {
      setAttempted(true);
      const appUrl = `https://app.versemate.org/bible/${bookId}/${chapterNumber}`;

      // Attempt to open app via Universal/App Link
      window.location.href = appUrl;

      // Fallback: redirect to web viewer after 3 seconds if still here
      setTimeout(() => {
        if (document.hasFocus()) {
          const testament = bookId <= 39 ? "OT" : "NT";
          router.push(
            `/?bookId=${bookId}&verseId=${chapterNumber}&testament=${testament}`,
          );
        }
      }, 3000);
    }, 2500);

    return () => clearTimeout(timer);
  }, [bookId, chapterNumber, router]);

  return (
    <div className="auto-open-status">
      <p>
        {attempted ? "Opening VerseMate..." : "Get ready to read in the app!"}
      </p>
    </div>
  );
}

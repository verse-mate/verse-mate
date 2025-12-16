"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../../analytics";
import { notify } from "../../notification";
import { Button } from "../Button/Button";
import { ShareIcon } from "../Icons/shareIcon";
import styles from "./share-button.module.css";
import type { ShareButtonProps } from "./types";

export function ShareButton({
  url,
  title = "VerseMate Bible Passage",
  text = "Check out this Bible passage",
  className = "",
  variant = "icon",
  analyticsContext,
}: ShareButtonProps) {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // Check if Web Share API is available
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const handleShare = useCallback(async () => {
    try {
      // Check if Web Share API is available (typically on mobile)
      if (canShare && navigator.share) {
        await navigator.share({
          title,
          text,
          url,
        });
        notify({
          content: "Shared successfully",
          color: "var(--success)",
        });
      } else {
        // Fallback to clipboard copy (typically on desktop)
        await navigator.clipboard.writeText(url);
        notify({
          content: "Link copied to clipboard",
          color: "var(--success)",
        });
      }

      // Track share event after successful share/copy
      if (analyticsContext) {
        if (analyticsContext.type === "chapter") {
          analytics.track(AnalyticsEvent.CHAPTER_SHARED, {
            bookId: Number(analyticsContext.bookIdOrCategory),
            chapterNumber: Number(analyticsContext.chapterOrSlug),
          });
        } else if (analyticsContext.type === "topic") {
          analytics.track(AnalyticsEvent.TOPIC_SHARED, {
            category: String(analyticsContext.bookIdOrCategory),
            topicSlug: String(analyticsContext.chapterOrSlug),
          });
        }
      }
    } catch (error) {
      // Handle AbortError (user cancelled) silently
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error sharing:", error);
      notify({
        content: "Failed to share. Please try again.",
        color: "var(--error)",
      });
    }
  }, [url, title, text, canShare, analyticsContext]);

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={`${styles.shareButton} ${className}`}
        aria-label="Share passage"
      >
        <ShareIcon />
      </button>
    );
  }

  return (
    <Button onClick={handleShare} className={className} variant="outlined">
      <ShareIcon className="w-4 h-4 mr-2" />
    </Button>
  );
}

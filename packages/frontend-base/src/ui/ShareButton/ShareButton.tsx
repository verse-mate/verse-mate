"use client";

import { useCallback, useEffect, useState } from "react";
import { notify } from "../../notification";
import { Button } from "../Button/Button";
import { CopyIcon } from "../Icons/copyIcon";
import { ShareIcon } from "../Icons/shareIcon";
import type { ShareButtonProps } from "./types";

export function ShareButton({
  url,
  title = "VerseMate Bible Passage",
  text = "Check out this Bible passage",
  className = "",
  variant = "icon",
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
  }, [url, title, text, canShare]);

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
        aria-label="Share passage"
      >
        {canShare ? <ShareIcon /> : <CopyIcon />}
      </button>
    );
  }

  return (
    <Button onClick={handleShare} className={className} variant="outlined">
      {canShare ? (
        <ShareIcon className="w-4 h-4 mr-2" />
      ) : (
        <CopyIcon className="w-4 h-4 mr-2" />
      )}
    </Button>
  );
}

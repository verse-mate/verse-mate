"use client";

import { useCallback } from "react";
import { CopyIcon } from "../Icons/copyIcon";
import type { CopyLinkButtonProps } from "./types";

export function CopyLinkButton({
  url,
  className = "",
  variant = "icon",
}: CopyLinkButtonProps) {
  const handleCopy = useCallback(async () => {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        throw new Error("Clipboard API not available");
      }

      await navigator.clipboard.writeText(url);
    } catch (error) {
      // Handle AbortError (user cancelled) silently
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("Error copying to clipboard:", error);
    }
  }, [url]);

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
        aria-label="Copy link"
        title="Copy link"
      >
        <CopyIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
      aria-label="Copy link"
    >
      <CopyIcon className="w-4 h-4 mr-2" />
      Copy Link
    </button>
  );
}

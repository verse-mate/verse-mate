import { type RefObject, useEffect } from "react";

/**
 * Hook that detects clicks outside of a given element and calls a callback function
 * @param ref - React ref object pointing to the element
 * @param callback - Function to call when clicking outside
 * @param enabled - Whether the hook is enabled (default: true)
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  callback: (event: MouseEvent | TouchEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Check if the ref exists and the clicked element is outside of it
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback(event);
      }
    };

    // Use mousedown instead of click for more reliable detection
    // This prevents issues with forms and other interactive elements
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    // Cleanup event listeners on unmount or when dependencies change
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [ref, callback, enabled]);
}

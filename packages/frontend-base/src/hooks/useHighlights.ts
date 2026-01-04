import { api } from "backend-api";
import type HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import { useCallback, useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../analytics";
import type { HighlightColor } from "../ui/HighlightColorPicker";
import { getChapterId } from "../utils/chapter-utils";
import { userSession } from "./userSession";

export interface Highlight {
  highlight_id: number;
  user_id: string;
  chapter_id: number;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  start_char?: number;
  end_char?: number;
  selected_text?: string;
  color: HighlightColor;
  created_at: string;
  updated_at: string;
}

// Backend API response types
interface HighlightApiResponse {
  highlight_id: number;
  user_id: string;
  chapter_id: number;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  start_char: number | null;
  end_char: number | null;
  selected_text: string | null;
  color: HighlightColorEnum;
  created_at: string;
  updated_at: string;
}

interface HighlightsApiResponse {
  highlights: HighlightApiResponse[];
}

interface CreateHighlightData {
  user_id: string;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  color: HighlightColorEnum;
  start_char?: number;
  end_char?: number;
  selected_text?: string;
}

// Create a singleton state that can be shared across components
let globalHighlights: Highlight[] = [];
// biome-ignore lint/complexity/noBannedTypes: Using Function[] is necessary for the notifyListeners functionality
let listeners: Function[] = [];

const notifyListeners = () => {
  listeners.forEach((listener) => listener(globalHighlights));
};

export const useHighlights = (bookId?: number, chapterNumber?: number) => {
  const { session } = userSession();
  const [highlights, setHighlights] = useState<Highlight[]>(globalHighlights);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = (newHighlights: Highlight[]) => {
      setHighlights(newHighlights);
    };
    listeners.push(listener);

    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  // Fetch highlights for the current chapter or all user highlights
  const fetchHighlights = useCallback(async () => {
    if (!session?.id) return;

    setLoading(true);
    setError(null);

    try {
      let response: { data?: HighlightsApiResponse; error?: unknown };
      if (bookId && chapterNumber) {
        // Fetch highlights for specific chapter
        // Note: Using type assertion for dynamic path - Eden Treaty limitation
        response = await (api.bible.highlights as any)[session.id][bookId][
          chapterNumber
        ].get();
      } else {
        // Fetch all user highlights
        // Note: Using type assertion for dynamic path - Eden Treaty limitation
        response = await (api.bible.highlights as any)[session.id].get();
      }

      if (response.error) {
        throw response.error;
      }

      if (response.data) {
        // Transform API response to match internal Highlight type
        const fetchedHighlights: Highlight[] = (
          response.data.highlights || []
        ).map((h) => ({
          ...h,
          start_char: h.start_char ?? undefined,
          end_char: h.end_char ?? undefined,
          selected_text: h.selected_text ?? undefined,
          color: h.color as HighlightColor,
        }));
        globalHighlights = fetchedHighlights;
        notifyListeners();
      }
    } catch (err) {
      console.error("Error fetching highlights:", err);
      setError("Failed to fetch highlights");
    } finally {
      setLoading(false);
    }
  }, [session?.id, bookId, chapterNumber]);

  // Create a new highlight
  const createHighlight = useCallback(
    async (
      bookId: number,
      chapterNumber: number,
      startVerse: number,
      endVerse: number,
      color: HighlightColor = "yellow",
      startChar?: number,
      endChar?: number,
      selectedText?: string,
      bookName?: string, // Optional for analytics
    ) => {
      if (!session?.id) {
        console.error("User not authenticated", {
          session,
          sessionId: session?.id,
          sessionKeys: session ? Object.keys(session) : "no session",
        });
        setError("User not authenticated");
        return false;
      }

      // FIX: Add validation to ensure startChar <= endChar before sending to backend
      // This prevents database constraint violations
      let validatedStartChar = startChar;
      let validatedEndChar = endChar;

      if (
        validatedStartChar !== undefined &&
        validatedEndChar !== undefined &&
        validatedStartChar > validatedEndChar
      ) {
        console.warn(
          "Invalid character range detected in createHighlight: startChar > endChar. Swapping values.",
          {
            startChar: validatedStartChar,
            endChar: validatedEndChar,
            startVerse,
            endVerse,
          },
        );
        // Swap the values to ensure valid range
        [validatedStartChar, validatedEndChar] = [
          validatedEndChar,
          validatedStartChar,
        ];
      }

      // FIX: Add bounds validation for character positions
      if (
        selectedText !== undefined &&
        validatedStartChar !== undefined &&
        validatedEndChar !== undefined
      ) {
        const expectedLength = selectedText.length;
        const actualLength = validatedEndChar - validatedStartChar;

        // If there's a significant discrepancy, log a warning
        if (Math.abs(actualLength - expectedLength) > 5) {
          console.warn("Character range length mismatch detected", {
            expectedLength,
            actualLength,
            startChar: validatedStartChar,
            endChar: validatedEndChar,
            selectedText,
          });
        }

        // Ensure character positions are non-negative
        if (validatedStartChar < 0) validatedStartChar = 0;
        if (validatedEndChar < 0) validatedEndChar = 0;
      }

      setLoading(true);
      setError(null);

      try {
        const highlightData: CreateHighlightData = {
          user_id: session.id,
          book_id: bookId,
          chapter_number: chapterNumber,
          start_verse: startVerse,
          end_verse: endVerse,
          color: color as HighlightColorEnum,
          ...(validatedStartChar !== undefined && {
            start_char: validatedStartChar,
          }),
          ...(validatedEndChar !== undefined && { end_char: validatedEndChar }),
          ...(selectedText && { selected_text: selectedText }),
        };

        const response = await api.bible.highlight.add.post(highlightData);

        if (response.error) {
          throw response.error;
        }

        if (response.data?.success) {
          if ("highlight" in response.data && response.data.highlight) {
            const newHighlight: Highlight = {
              ...response.data.highlight,
              start_char: response.data.highlight.start_char ?? undefined,
              end_char: response.data.highlight.end_char ?? undefined,
              selected_text: response.data.highlight.selected_text ?? undefined,
              created_at:
                response.data.highlight.created_at?.toString() ||
                new Date().toISOString(),
              updated_at:
                response.data.highlight.updated_at?.toString() ||
                new Date().toISOString(),
            };
            globalHighlights = [...globalHighlights, newHighlight];
            notifyListeners();

            // Track HIGHLIGHT_CREATED event
            analytics.track(AnalyticsEvent.HIGHLIGHT_CREATED, {
              bookId,
              bookName: bookName || "",
              chapterNumber,
              verseNumber: startVerse,
              highlightColor: color,
            });
          }
          return true;
        }
        setError(response.data?.error || "Failed to create highlight");
        return false;
      } catch (err) {
        console.error("Error creating highlight:", err);
        // Enhanced error handling with specific messages from backend
        if (err && typeof err === "object" && "error" in err) {
          setError(
            (err as { error: string }).error || "Failed to create highlight",
          );
        } else {
          setError("Failed to create highlight");
        }
        return false;
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  // Update highlight color
  const updateHighlightColor = useCallback(
    async (
      highlightId: number,
      color: HighlightColor,
      bookName?: string, // Optional for analytics
    ) => {
      if (!session?.id) {
        setError("User not authenticated");
        return false;
      }

      // Store original highlights for potential rollback
      const originalHighlights = [...globalHighlights];

      // Get the current highlight for analytics
      const currentHighlight = globalHighlights.find(
        (h) => h.highlight_id === highlightId,
      );
      const previousColor = currentHighlight?.color;

      if (currentHighlight) {
        // Optimistic update - change color immediately in UI
        globalHighlights = globalHighlights.map((h) =>
          h.highlight_id === highlightId
            ? { ...h, color, updated_at: new Date().toISOString() }
            : h,
        );
        notifyListeners();
      }

      setLoading(true);
      setError(null);

      try {
        const response = await api.bible
          .highlight({ highlight_id: highlightId })
          .put({
            user_id: session.id,
            color: color as HighlightColorEnum,
          });

        if (response.error) {
          throw response.error;
        }

        if (response.data?.success) {
          if ("highlight" in response.data && response.data.highlight) {
            const updatedHighlight: Highlight = {
              ...response.data.highlight,
              start_char: response.data.highlight.start_char ?? undefined,
              end_char: response.data.highlight.end_char ?? undefined,
              selected_text: response.data.highlight.selected_text ?? undefined,
              created_at:
                response.data.highlight.created_at?.toString() ||
                new Date().toISOString(),
              updated_at:
                response.data.highlight.updated_at?.toString() ||
                new Date().toISOString(),
            };
            globalHighlights = globalHighlights.map((h) =>
              h.highlight_id === highlightId ? updatedHighlight : h,
            );
            notifyListeners();

            // Track HIGHLIGHT_EDITED event
            if (previousColor && previousColor !== color) {
              analytics.track(AnalyticsEvent.HIGHLIGHT_EDITED, {
                bookId: 0, // Chapter ID is stored in the highlight, not book ID
                bookName: bookName || "",
                chapterNumber: 0,
                verseNumber: currentHighlight?.start_verse || 0,
                previousColor: previousColor,
                newColor: color,
              });
            }
          }
          return true;
        }
        globalHighlights = originalHighlights;
        notifyListeners();
        setError("Failed to update highlight");
        return false;
      } catch (err) {
        console.error("Error updating highlight:", err);
        globalHighlights = originalHighlights;
        notifyListeners();
        setError("Failed to update highlight");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  // Delete a highlight
  const deleteHighlight = useCallback(
    async (highlightId: number, bookName?: string) => {
      if (!session?.id) {
        setError("User not authenticated");
        return false;
      }

      const originalHighlights = [...globalHighlights];

      // Get the highlight for analytics before deleting
      const highlightToDelete = globalHighlights.find(
        (h) => h.highlight_id === highlightId,
      );

      // Optimistic update - remove immediately from UI
      globalHighlights = globalHighlights.filter(
        (h) => h.highlight_id !== highlightId,
      );
      notifyListeners();

      setLoading(true);
      setError(null);

      try {
        const response = await api.bible
          .highlight({ highlight_id: highlightId })
          .delete(undefined, {
            query: { user_id: session.id },
          });

        if (response.error) {
          throw response.error;
        }

        if (response.data?.success) {
          // Track HIGHLIGHT_DELETED event
          if (highlightToDelete) {
            analytics.track(AnalyticsEvent.HIGHLIGHT_DELETED, {
              bookId: 0, // Chapter ID is stored, not book ID
              bookName: bookName || "",
              chapterNumber: 0,
              verseNumber: highlightToDelete.start_verse,
              highlightColor: highlightToDelete.color,
            });
          }
          return true;
        }
        globalHighlights = originalHighlights;
        notifyListeners();
        setError("Failed to delete highlight");
        return false;
      } catch (err) {
        console.error("Error deleting highlight:", err);
        globalHighlights = originalHighlights;
        notifyListeners();
        setError("Failed to delete highlight");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  // State to manage chapter IDs for filtering
  const [chapterIdMap, setChapterIdMap] = useState<
    Record<string, number | null>
  >({});

  // Get highlights for a specific chapter
  const getChapterHighlights = useCallback(
    async (
      targetBookId: number,
      targetChapterNumber: number,
    ): Promise<Highlight[]> => {
      const cacheKey = `${targetBookId}-${targetChapterNumber}`;

      // Check if we already have the chapter ID
      let targetChapterId = chapterIdMap[cacheKey];

      if (targetChapterId === undefined) {
        // Fetch chapter ID if not cached
        targetChapterId = await getChapterId(targetBookId, targetChapterNumber);

        // Cache the result
        setChapterIdMap((prev) => ({ ...prev, [cacheKey]: targetChapterId }));
      }

      if (targetChapterId === null) {
        // If we can't determine chapter_id, return empty array to prevent wrong highlights
        console.warn(
          `Cannot filter highlights for book_id ${targetBookId}, chapter ${targetChapterNumber}: chapter_id lookup failed`,
        );
        return [];
      }

      return highlights.filter(
        (highlight) => highlight.chapter_id === targetChapterId,
      );
    },
    [highlights, chapterIdMap],
  );

  // Synchronous version for backward compatibility (less accurate but immediate)
  const getChapterHighlightsSync = useCallback(
    (targetBookId: number, targetChapterNumber: number): Highlight[] => {
      const cacheKey = `${targetBookId}-${targetChapterNumber}`;
      const targetChapterId = chapterIdMap[cacheKey];

      if (targetChapterId === undefined) {
        // Chapter ID not loaded yet - trigger async load
        getChapterHighlights(targetBookId, targetChapterNumber);
        return []; // Return empty array until loaded
      }

      if (targetChapterId === null) {
        return [];
      }

      return highlights.filter(
        (highlight) => highlight.chapter_id === targetChapterId,
      );
    },
    [highlights, chapterIdMap, getChapterHighlights],
  );

  // Auto-fetch highlights when user session loads
  useEffect(() => {
    if (session?.id) {
      fetchHighlights();
    }
  }, [session?.id, fetchHighlights]);

  return {
    highlights,
    loading,
    error,
    fetchHighlights,
    createHighlight,
    updateHighlightColor,
    deleteHighlight,
    getChapterHighlights,
    getChapterHighlightsSync,
  };
};

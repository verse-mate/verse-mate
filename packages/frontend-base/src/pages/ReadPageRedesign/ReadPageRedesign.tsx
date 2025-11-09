"use client";

import { useCallback, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { HeaderRedesign } from "../../Main/Header/HeaderRedesign";
import { DesktopLayout } from "../../Main/Layout/DesktopLayout";
import { fetchBookVerse } from "../../hooks/useBible";
import { useBookmarks } from "../../hooks/useBookmarks";
import { type Highlight, useHighlights } from "../../hooks/useHighlights";
import { useNotes } from "../../hooks/useNotes";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../hooks/useSearchParams";
import { userSession } from "../../hooks/userSession";
import { BibleText, type HighlightData } from "../../ui/BibleText";
import {
  HighlightsPanel,
  type Highlight as HighlightsPanelData,
} from "../../ui/HighlightsPanel";
import { WordDefinitionPopover } from "../../ui/WordDefinition";
import styles from "./read-page-redesign.module.css";

/**
 * ReadPageRedesign - New read page using Figma redesign components
 * Phases 4.1-4.7 - Complete Integration
 *
 * This component serves as a fully integrated demonstration of the Figma redesign,
 * combining all Phase 1-3 components with backend API integration.
 *
 * Features:
 * - Three-panel resizable layout (DesktopLayout)
 * - Real Bible text from API (fetchBookVerse)
 * - Full highlights CRUD with character-level precision
 * - Bookmarks and notes integration
 * - URL-driven navigation (bookId, verseId, bibleVersion)
 * - Toast notifications for user feedback (sonner)
 * - Word definition popover
 * - Optimized state management with useMemo/useCallback
 * - Loading states for async operations
 * - Theme support via HeaderRedesign
 *
 * Performance Optimizations:
 * - Memoized derived data (verses, highlightsPanelData)
 * - Memoized callbacks (getHighlightsForVerse, convertToHighlightsPanelData)
 * - Loading indicators for all async operations
 * - Optimistic updates via existing hooks
 */
export function ReadPageRedesign() {
  const { session } = userSession();

  // Get URL params for navigation
  const { bookId, verseId, bibleVersion } = useGetSearchParams();
  const { saveSearchParams } = useSaveSearchParams();

  // Hooks for data
  const {
    highlights,
    createHighlight,
    updateHighlightColor,
    deleteHighlight,
    getChapterHighlightsSync,
  } = useHighlights();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { notes, addNote } = useNotes();

  // Use URL params for current state (fallback to defaults)
  const currentBook = { id: Number(bookId) || 1, name: "Genesis" }; // Would look up name from bookId
  const currentChapter = Number(verseId) || 1;
  const currentVersion = bibleVersion || "NASB1995";

  // Fetch Bible data from API
  const { bookVerseData, isLoading: isBibleLoading } = fetchBookVerse(
    currentBook.id,
    currentChapter,
    currentVersion,
  );

  // State for word definition popover
  const [definitionPopover, setDefinitionPopover] = useState<{
    word: string;
    position: { x: number; y: number };
  } | null>(null);

  // State for navigation highlight (glow effect)
  const [glowingHighlightId, setGlowingHighlightId] = useState<string | null>(
    null,
  );

  // State for loading indicators
  const [isCreatingHighlight, setIsCreatingHighlight] = useState(false);
  const [isDeletingHighlight, setIsDeletingHighlight] = useState(false);
  const [isUpdatingHighlight, setIsUpdatingHighlight] = useState(false);

  // Extract verses from API data (memoized to prevent re-creation on every render)
  const verses = useMemo(
    () =>
      bookVerseData?.chapters?.[0]?.verses?.map((v) => ({
        number: v.verseNumber,
        text: v.text,
      })) || [],
    [bookVerseData],
  );

  // Convert Highlight (from useHighlights) to HighlightData (for BibleText)
  // Memoized to prevent re-creation on every render
  const getHighlightsForVerse = useCallback(
    (verseNumber: number): HighlightData[] => {
      const chapterHighlights = getChapterHighlightsSync(
        currentBook.id,
        currentChapter,
      );

      return chapterHighlights
        .filter(
          (h) => h.start_verse <= verseNumber && h.end_verse >= verseNumber,
        )
        .map((h) => ({
          id: h.highlight_id.toString(),
          color: h.color,
          startOffset: h.start_char,
          endOffset: h.end_char,
          isGlowing: glowingHighlightId === h.highlight_id.toString(),
        }));
    },
    [
      currentBook.id,
      currentChapter,
      getChapterHighlightsSync,
      glowingHighlightId,
    ],
  );

  // Convert Highlight (from useHighlights) to HighlightsPanelData
  // Memoized to prevent re-creation on every render
  const convertToHighlightsPanelData = useCallback(
    (highlight: Highlight): HighlightsPanelData => {
      // For now, use placeholder book/chapter - in real implementation,
      // we'd look up the chapter to get book name
      return {
        id: highlight.highlight_id.toString(),
        reference: `${currentBook.name} ${currentChapter}:${highlight.start_verse}${highlight.start_verse !== highlight.end_verse ? `-${highlight.end_verse}` : ""}`,
        text:
          highlight.selected_text ||
          `Verses ${highlight.start_verse}-${highlight.end_verse}`,
        color: highlight.color,
        book: currentBook.name,
        chapter: currentChapter,
        verse: highlight.start_verse,
        startOffset: highlight.start_char,
        endOffset: highlight.end_char,
      };
    },
    [currentBook.name, currentChapter],
  );

  // Handle highlight creation from BibleText component
  const handleHighlight = async (
    color: "blue" | "green" | "yellow" | "pink" | "purple" | "orange" | null,
    startOffset: number,
    endOffset: number,
    verseNumber: number,
  ) => {
    if (!color) return;

    const verse = verses.find((v) => v.number === verseNumber);
    const selectedText = verse?.text.slice(startOffset, endOffset);

    setIsCreatingHighlight(true);
    try {
      const success = await createHighlight(
        currentBook.id,
        currentChapter,
        verseNumber,
        verseNumber,
        color,
        startOffset,
        endOffset,
        selectedText,
      );

      if (success) {
        toast.success("Highlight created");
      } else {
        toast.error("Failed to create highlight");
      }
    } finally {
      setIsCreatingHighlight(false);
    }
  };

  // Handle navigation to highlighted verse
  const handleNavigateToVerse = useCallback(
    (bookId: number, chapter: number, verse: number, highlightId: string) => {
      // Update URL to navigate to the verse
      saveSearchParams({
        bookId: bookId.toString(),
        verseId: chapter.toString(),
        bibleVersion: currentVersion,
      });

      // Flash the highlight
      setGlowingHighlightId(highlightId);
      setTimeout(() => setGlowingHighlightId(null), 4500); // 3 pulses * 1.5s

      // Show navigation toast
      toast.success(`Navigated to ${currentBook.name} ${chapter}:${verse}`);
    },
    [saveSearchParams, currentVersion, currentBook.name],
  );

  // Handle bookmark toggle
  const handleBookmarkToggle = useCallback(() => {
    if (isBookmarked(currentBook.id, currentChapter)) {
      removeBookmark(currentBook.id, currentChapter);
      toast.success("Bookmark removed");
    } else {
      addBookmark(currentBook.id, currentChapter, currentBook.name, "OT");
      toast.success("Bookmark added");
    }
  }, [
    isBookmarked,
    addBookmark,
    removeBookmark,
    currentBook.id,
    currentBook.name,
    currentChapter,
  ]);

  // Handle note operations
  const handleAddNote = useCallback(
    (verseNumber?: number) => {
      const noteContent = prompt("Enter your note:");
      if (noteContent) {
        addNote({
          bookName: currentBook.name,
          bookId: currentBook.id,
          chapterNumber: currentChapter,
          verseNumber,
          content: noteContent,
        });
        toast.success("Note added");
      }
    },
    [addNote, currentBook.id, currentBook.name, currentChapter],
  );

  // Navigate to different chapter
  const handleChapterChange = useCallback(
    (newChapter: number) => {
      saveSearchParams({
        bookId: currentBook.id.toString(),
        verseId: newChapter.toString(),
        bibleVersion: currentVersion,
      });
    },
    [saveSearchParams, currentBook.id, currentVersion],
  );

  // Handle delete highlight
  const handleDeleteHighlight = async (highlightId: string) => {
    setIsDeletingHighlight(true);
    try {
      const success = await deleteHighlight(Number(highlightId));
      if (success) {
        toast.success("Highlight deleted");
      } else {
        toast.error("Failed to delete highlight");
      }
    } finally {
      setIsDeletingHighlight(false);
    }
  };

  // Handle color change
  const handleColorChange = async (
    highlightId: string,
    newColor: "blue" | "green" | "yellow" | "pink" | "purple" | "orange" | null,
  ) => {
    if (!newColor) return;
    setIsUpdatingHighlight(true);
    try {
      const success = await updateHighlightColor(Number(highlightId), newColor);
      if (success) {
        toast.success("Highlight color updated");
      } else {
        toast.error("Failed to update highlight color");
      }
    } finally {
      setIsUpdatingHighlight(false);
    }
  };

  // Memoize highlights panel data to prevent unnecessary re-renders
  const highlightsPanelData = useMemo(
    () => highlights.map(convertToHighlightsPanelData),
    [highlights, convertToHighlightsPanelData],
  );

  // Show global loading state if any operation is in progress
  const isAnyOperationLoading =
    isCreatingHighlight || isDeletingHighlight || isUpdatingHighlight;

  return (
    <div className={styles.container}>
      <Toaster position="bottom-right" />
      <HeaderRedesign
        currentBook={currentBook.name}
        currentChapter={currentChapter}
        currentVersion={currentVersion}
        onBookChange={() => {
          // Book change handling would be implemented when wired to actual routes
        }}
        onChapterChange={(chapter) => handleChapterChange(chapter)}
        onVersionChange={(version) =>
          saveSearchParams({ bibleVersion: version })
        }
      />

      <DesktopLayout
        leftPanel={
          <div className={styles.leftPanelContent}>
            <h2>Navigation</h2>

            <div className={styles.navigationSection}>
              <h3>Quick Navigation</h3>
              <div className={styles.navigationButtons}>
                <button
                  type="button"
                  onClick={() =>
                    handleChapterChange(Math.max(1, currentChapter - 1))
                  }
                  disabled={currentChapter <= 1}
                  className={styles.navButton}
                >
                  ← Previous Chapter
                </button>
                <button
                  type="button"
                  onClick={() => handleChapterChange(currentChapter + 1)}
                  className={styles.navButton}
                >
                  Next Chapter →
                </button>
              </div>
            </div>

            <div className={styles.navigationSection}>
              <h3>Info</h3>
              <p className={styles.infoText}>
                Current: {currentBook.name} {currentChapter}
              </p>
              <p className={styles.infoText}>
                Bookmarked:{" "}
                {isBookmarked(currentBook.id, currentChapter) ? "Yes" : "No"}
              </p>
              <p className={styles.infoText}>
                Notes:{" "}
                {
                  notes.filter(
                    (n) =>
                      n.bookId === currentBook.id &&
                      n.chapterNumber === currentChapter,
                  ).length
                }
              </p>
              <p className={styles.infoText}>
                Highlights:{" "}
                {
                  highlights.filter((h) =>
                    getChapterHighlightsSync(
                      currentBook.id,
                      currentChapter,
                    ).includes(h),
                  ).length
                }
              </p>
              {isAnyOperationLoading && (
                <p className={styles.infoText}>
                  <span className={styles.loadingIndicator}>
                    ⏳ Processing...
                  </span>
                </p>
              )}
            </div>
          </div>
        }
        centerPanel={
          <div className={styles.centerPanelContent}>
            <div className={styles.chapterHeader}>
              <h1>
                {currentBook.name} {currentChapter}
              </h1>
            </div>

            {isBibleLoading ? (
              <div className={styles.loading}>Loading verses...</div>
            ) : verses.length === 0 ? (
              <div className={styles.empty}>No verses found</div>
            ) : (
              <div className={styles.verseContainer}>
                {verses.map((verse) => (
                  <div key={verse.number} className={styles.verse}>
                    <BibleText
                      text={verse.text}
                      verseNumber={verse.number}
                      verseReference={`${currentBook.name} ${currentChapter}:${verse.number}`}
                      highlight={getHighlightsForVerse(verse.number)}
                      onHighlight={(color, startOffset, endOffset) =>
                        handleHighlight(
                          color,
                          startOffset,
                          endOffset,
                          verse.number,
                        )
                      }
                      onBookmark={handleBookmarkToggle}
                      onNote={() => handleAddNote(verse.number)}
                      onWordClick={(word, position) =>
                        setDefinitionPopover({ word, position })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {definitionPopover && (
              <WordDefinitionPopover
                word={definitionPopover.word}
                position={definitionPopover.position}
                onClose={() => setDefinitionPopover(null)}
              />
            )}
          </div>
        }
        rightPanel={
          <div className={styles.rightPanelContent}>
            <HighlightsPanel
              highlights={highlightsPanelData}
              onNavigate={handleNavigateToVerse}
              onDelete={handleDeleteHighlight}
              onColorChange={handleColorChange}
            />
          </div>
        }
      />

      {!session && (
        <div className={styles.authPrompt}>
          <p>Sign in to save highlights</p>
        </div>
      )}
    </div>
  );
}

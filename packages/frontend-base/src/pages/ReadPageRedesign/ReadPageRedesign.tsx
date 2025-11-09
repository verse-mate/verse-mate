"use client";

import { useState } from "react";
import { fetchBookVerse } from "../../hooks/useBible";
import { useHighlights, type Highlight } from "../../hooks/useHighlights";
import { userSession } from "../../hooks/userSession";
import { DesktopLayout } from "../../Main/Layout/DesktopLayout";
import { HeaderRedesign } from "../../Main/Header/HeaderRedesign";
import { BibleText, type HighlightData } from "../../ui/BibleText";
import {
  HighlightsPanel,
  type Highlight as HighlightsPanelData,
} from "../../ui/HighlightsPanel";
import { WordDefinitionPopover } from "../../ui/WordDefinition";
import styles from "./read-page-redesign.module.css";

/**
 * ReadPageRedesign - New read page using Figma redesign components
 * Phase 4.1 - Integration
 *
 * This component integrates all Phase 3 components with the existing
 * backend API via useHighlights hook
 */
export function ReadPageRedesign() {
  const { session } = userSession();
  const {
    highlights,
    createHighlight,
    updateHighlightColor,
    deleteHighlight,
    getChapterHighlightsSync,
  } = useHighlights();

  // State for current book/chapter (would come from URL params in real implementation)
  const [currentBook] = useState({ id: 1, name: "Genesis" });
  const [currentChapter] = useState(1);
  const [currentVersion] = useState("NASB1995");

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

  // Extract verses from API data
  const verses =
    bookVerseData?.chapters?.[0]?.verses?.map((v) => ({
      number: v.verseNumber,
      text: v.text,
    })) || [];

  // Convert Highlight (from useHighlights) to HighlightData (for BibleText)
  const getHighlightsForVerse = (verseNumber: number): HighlightData[] => {
    const chapterHighlights = getChapterHighlightsSync(
      currentBook.id,
      currentChapter,
    );

    return chapterHighlights
      .filter((h) => h.start_verse <= verseNumber && h.end_verse >= verseNumber)
      .map((h) => ({
        id: h.highlight_id.toString(),
        color: h.color,
        startOffset: h.start_char,
        endOffset: h.end_char,
        isGlowing: glowingHighlightId === h.highlight_id.toString(),
      }));
  };

  // Convert Highlight (from useHighlights) to HighlightsPanelData
  const convertToHighlightsPanelData = (
    highlight: Highlight,
  ): HighlightsPanelData => {
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
  };

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
      // Show success toast (would use sonner in real implementation)
      console.log("Highlight created successfully");
    }
  };

  // Handle navigation to highlighted verse
  const handleNavigateToVerse = (
    bookId: number,
    chapter: number,
    verse: number,
    highlightId: string,
  ) => {
    // In real implementation:
    // 1. Update URL params to navigate to book/chapter/verse
    // 2. Scroll to verse
    // 3. Flash highlight
    console.log("Navigate to:", { bookId, chapter, verse, highlightId });

    // Flash the highlight
    setGlowingHighlightId(highlightId);
    setTimeout(() => setGlowingHighlightId(null), 4500); // 3 pulses * 1.5s
  };

  // Handle delete highlight
  const handleDeleteHighlight = async (highlightId: string) => {
    const success = await deleteHighlight(Number(highlightId));
    if (success) {
      console.log("Highlight deleted successfully");
    }
  };

  // Handle color change
  const handleColorChange = async (
    highlightId: string,
    newColor: "blue" | "green" | "yellow" | "pink" | "purple" | "orange" | null,
  ) => {
    if (!newColor) return;
    const success = await updateHighlightColor(Number(highlightId), newColor);
    if (success) {
      console.log("Highlight color updated successfully");
    }
  };

  const highlightsPanelData = highlights.map(convertToHighlightsPanelData);

  return (
    <div className={styles.container}>
      <HeaderRedesign
        currentBook={currentBook.name}
        currentChapter={currentChapter}
        currentVersion={currentVersion}
      />

      <DesktopLayout
        leftPanel={
          <div className={styles.leftPanelContent}>
            <h2>Navigation</h2>
            <p>Book selection will go here</p>
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

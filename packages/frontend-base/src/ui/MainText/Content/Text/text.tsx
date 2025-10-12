import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetSearchParams } from "../../../../hooks/useSearchParams";
import { generateShareableUrl } from "../../../../utils/sharing";
import { BookmarkButton } from "../../../Bookmarks";
import { CopyLinkButton } from "../../../CopyLinkButton";
import { HighlightColorPicker } from "../../../HighlightColorPicker";
import type { HighlightColor } from "../../../HighlightColorPicker/types";
import { HighlightMenu } from "../../../HighlightMenu";
import { NotesButton } from "../../../Notes/NotesButton";
import { ShareButton } from "../../../ShareButton";
import styles from "./text.module.css";
import type { Highlight, TextProps } from "./types";

const formatSubtitle = (subtitle: string) => {
  if (!subtitle) return "";
  // Add a space before capital letters, but not at the beginning of the string.
  return subtitle.replace(/([A-Z])/g, " $1").trim();
};

export const Text = ({
  text,
  bookName,
  testament,
  bookId,
  chapterId,
  highlights = [],
  onHighlightCreate,
  onHighlightDelete,
  onHighlightUpdate,
}: TextProps) => {
  const searchParams = useGetSearchParams();
  const [selectedVerses, setSelectedVerses] = useState<{
    start: number;
    end: number;
    startChar?: number;
    endChar?: number;
    selectedText?: string;
  } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const versesContainerRef = useRef<HTMLDivElement>(null);

  const shareUrl = useMemo(
    () =>
      generateShareableUrl({
        bookId: bookId != null ? String(bookId) : null,
        verseId:
          searchParams.verseId != null ? String(searchParams.verseId) : null,
        testament: testament ?? null,
        explanationType: searchParams.explanationType ?? null,
        bibleVersion: searchParams.bibleVersion ?? null,
      }),
    [
      bookId,
      searchParams.verseId,
      testament,
      searchParams.explanationType,
      searchParams.bibleVersion,
    ],
  );

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !versesContainerRef.current)
      return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const container = versesContainerRef.current;

    // Get all verse elements
    const verseElements = container.querySelectorAll("[data-verse-number]");

    let startVerse: number | null = null;
    let endVerse: number | null = null;
    let startChar: number | undefined = undefined;
    let endChar: number | undefined = undefined;

    // Find verses that contain the selection
    const involvedVerses: {
      verseNum: number;
      element: Element;
      textNode: Text | null;
    }[] = [];

    verseElements.forEach((element) => {
      if (selection.containsNode(element, true)) {
        const verseNum = Number.parseInt(
          element.getAttribute("data-verse-number") || "0",
          10,
        );
        const verseTextElement = element.querySelector(`.${styles.verseText}`);
        const textNode = verseTextElement?.firstChild as Text | null;

        involvedVerses.push({ verseNum, element, textNode });

        if (startVerse === null || verseNum < startVerse) startVerse = verseNum;
        if (endVerse === null || verseNum > endVerse) endVerse = verseNum;
      }
    });

    if (startVerse && endVerse && involvedVerses.length > 0) {
      try {
        // Calculate character positions for start and end verses
        const startVerseData = involvedVerses.find(
          (v) => v.verseNum === startVerse,
        );
        const endVerseData = involvedVerses.find(
          (v) => v.verseNum === endVerse,
        );

        if (startVerseData) {
          // For single verse selection, calculate both start and end positions
          if (startVerse === endVerse) {
            // Handle text selections within verse elements
            const cssSelector = `.${styles.verseText}`;
            const verseElement =
              startVerseData.element.querySelector(cssSelector);

            if (
              verseElement?.contains(range.startContainer) &&
              verseElement.contains(range.endContainer)
            ) {
              // Get the full text content of the verse
              const fullVerseText = verseElement.textContent || "";
              // Normalize whitespace for better matching
              const normalizeText = (text: string) =>
                text.replace(/\s+/g, " ").trim();
              const normalizedVerseText = normalizeText(fullVerseText);
              const normalizedSelectedText = normalizeText(selectedText);

              // Try multiple approaches to find the text position
              let foundPosition = -1;

              // Approach 1: Direct match
              foundPosition = fullVerseText.indexOf(selectedText);

              // Approach 2: Normalized match
              if (foundPosition === -1) {
                const normalizedPosition = normalizedVerseText.indexOf(
                  normalizedSelectedText,
                );
                if (normalizedPosition !== -1) {
                  // Map back to original text position
                  for (let i = 0; i < fullVerseText.length; i++) {
                    if (
                      normalizeText(fullVerseText.substring(0, i + 1)).length >
                      normalizedPosition
                    ) {
                      foundPosition = i - normalizedSelectedText.length + 1;
                      break;
                    }
                  }
                }
              }

              // Approach 3: Case-insensitive match
              if (foundPosition === -1) {
                foundPosition = fullVerseText
                  .toLowerCase()
                  .indexOf(selectedText.toLowerCase());
              }

              // FIX: Add more robust text matching approaches
              // Approach 4: Sliding window match for partial matches
              if (foundPosition === -1) {
                const windowSize = Math.min(selectedText.length, 20);
                for (let i = 0; i <= fullVerseText.length - windowSize; i++) {
                  const windowText = fullVerseText.substring(i, i + windowSize);
                  const selectedWindow = selectedText.substring(
                    0,
                    Math.min(windowSize, selectedText.length),
                  );
                  if (windowText === selectedWindow) {
                    // Found a potential match, check if the full text matches
                    const candidateText = fullVerseText.substring(
                      i,
                      i + selectedText.length,
                    );
                    if (
                      Math.abs(candidateText.length - selectedText.length) <= 5
                    ) {
                      foundPosition = i;
                      break;
                    }
                  }
                }
              }

              if (foundPosition !== -1) {
                startChar = foundPosition;
                endChar = foundPosition + selectedText.length;
              } else {
                // Fallback: try DOM-based calculation if text matching fails
                try {
                  // Approach 4: DOM Range-based calculation
                  const tempRange = document.createRange();

                  // Calculate start position
                  tempRange.selectNodeContents(verseElement);
                  tempRange.setEnd(range.startContainer, range.startOffset);
                  const calculatedStartChar = tempRange.toString().length;

                  // Calculate end position
                  tempRange.selectNodeContents(verseElement);
                  tempRange.setEnd(range.endContainer, range.endOffset);
                  const calculatedEndChar = tempRange.toString().length;

                  // FIX: Add validation for DOM-based calculation
                  if (
                    calculatedStartChar >= 0 &&
                    calculatedEndChar >= 0 // Changed from > calculatedStartChar to >= 0
                  ) {
                    const extractedText = fullVerseText.substring(
                      calculatedStartChar,
                      calculatedEndChar,
                    );

                    // Use DOM-based calculation if it makes sense
                    if (
                      extractedText === selectedText ||
                      normalizeText(extractedText) === normalizedSelectedText ||
                      // Additional validation: check if the extracted text is a substring of selected text
                      selectedText.includes(extractedText) ||
                      extractedText.includes(selectedText)
                    ) {
                      startChar = calculatedStartChar;
                      endChar = calculatedEndChar;

                      // FIX: Ensure startChar <= endChar even with DOM-based calculation
                      if (startChar > endChar) {
                        [startChar, endChar] = [endChar, startChar];
                      }
                    } else {
                      startChar = undefined;
                      endChar = undefined;
                    }
                  } else {
                    startChar = undefined;
                    endChar = undefined;
                  }
                } catch (_domError) {
                  startChar = undefined;
                  endChar = undefined;
                }
              }
            } else {
              // Try alternative approach when containers are not within verse element
              let current = range.startContainer.parentNode;
              let depth = 0;
              while (current && depth < 10) {
                if (current === verseElement) {
                  break;
                }
                current = current.parentNode;
                depth++;
              }

              // Try to calculate positions using the full verse text and selected text matching
              const fullVerseText = verseElement?.textContent || "";
              const selectedTextPosition = fullVerseText.indexOf(selectedText);

              if (selectedTextPosition !== -1) {
                startChar = selectedTextPosition;
                endChar = selectedTextPosition + selectedText.length;
              } else {
                // FIX: More robust text matching using multiple strategies
                // Strategy 1: Try normalized text matching
                const normalizeText = (text: string) =>
                  text.replace(/\s+/g, " ").trim();
                const normalizedVerseText = normalizeText(fullVerseText);
                const normalizedSelectedText = normalizeText(selectedText);

                const normalizedPosition = normalizedVerseText.indexOf(
                  normalizedSelectedText,
                );
                if (normalizedPosition !== -1) {
                  // Map back to original text position
                  let charCount = 0;
                  let normalizedCharCount = 0;
                  let foundStart = -1;

                  for (let i = 0; i < fullVerseText.length; i++) {
                    if (
                      normalizedCharCount === normalizedPosition &&
                      foundStart === -1
                    ) {
                      foundStart = charCount;
                    }
                    if (
                      normalizedCharCount ===
                      normalizedPosition + normalizedSelectedText.length
                    ) {
                      startChar = foundStart;
                      endChar = charCount;
                      break;
                    }

                    if (
                      fullVerseText[i] !== " " ||
                      (i > 0 && fullVerseText[i - 1] !== " ")
                    ) {
                      if (
                        fullVerseText[i] !== "\n" &&
                        fullVerseText[i] !== "\r"
                      ) {
                        normalizedCharCount++;
                      }
                    }
                    charCount++;
                  }
                }

                // If still not found, fall back to verse-level highlighting
                if (startChar === undefined || endChar === undefined) {
                  startChar = undefined;
                  endChar = undefined;
                }
              }
            }
          } else {
            // Multi-verse selection: start char in first verse, end char in last verse
            // FIX: Improve multi-verse selection logic for more accurate character positioning
            const startVerseElement = startVerseData.element.querySelector(
              `.${styles.verseText}`,
            );
            if (startVerseElement) {
              // Calculate start position more accurately
              try {
                const tempRange = document.createRange();
                tempRange.selectNodeContents(startVerseElement);
                tempRange.setStart(range.startContainer, range.startOffset);
                const textFromStart = tempRange.toString();
                const fullStartVerseText = startVerseElement.textContent || "";
                startChar = fullStartVerseText.length - textFromStart.length;

                // Ensure startChar is within bounds
                if (startChar < 0) startChar = 0;
                if (startChar > fullStartVerseText.length)
                  startChar = fullStartVerseText.length;
              } catch {
                startChar = 0; // Fallback to beginning of verse
              }
            }

            if (endVerseData?.textNode) {
              const endVerseElement = endVerseData.element.querySelector(
                `.${styles.verseText}`,
              );
              if (endVerseElement) {
                // Calculate end position more accurately
                try {
                  const tempRange = document.createRange();
                  tempRange.selectNodeContents(endVerseElement);
                  tempRange.setEnd(range.endContainer, range.endOffset);
                  endChar = tempRange.toString().length;

                  // Ensure endChar is within bounds
                  const fullEndVerseText = endVerseElement.textContent || "";
                  if (endChar < 0) endChar = 0;
                  if (endChar > fullEndVerseText.length)
                    endChar = fullEndVerseText.length;
                } catch {
                  const fullEndVerseText = endVerseElement.textContent || "";
                  endChar = fullEndVerseText.length; // Fallback to end of verse
                }
              }
            }

            // FIX: Add validation for multi-verse selection
            if (startChar !== undefined && endChar !== undefined) {
              // For multi-verse selections, we need to ensure the character positions make sense
              // Since they're in different verses, we can't directly compare them
              // But we should ensure they're non-negative
              if (startChar < 0) startChar = 0;
              if (endChar < 0) endChar = 0;
            }
          }
        }
      } catch {
        // Fall back to verse-level highlighting if character calculation fails
        startChar = undefined;
        endChar = undefined;
      }

      // FIX: Add validation to ensure startChar <= endChar
      // This prevents database constraint violations
      if (
        startChar !== undefined &&
        endChar !== undefined &&
        startChar > endChar
      ) {
        console.warn(
          "Invalid character range detected: startChar > endChar. Swapping values.",
          {
            startChar,
            endChar,
            selectedText,
          },
        );
        // Swap the values to ensure valid range
        [startChar, endChar] = [endChar, startChar];
      }

      setSelectedVerses({
        start: startVerse,
        end: endVerse,
        startChar,
        endChar,
        selectedText,
      });

      // Position color picker near selection
      const rect = range.getBoundingClientRect();
      setPickerPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 10,
      });
      setShowColorPicker(true);
    }
  }, []);

  const handleHighlightCreate = useCallback(
    async (color: HighlightColor) => {
      if (!selectedVerses || !onHighlightCreate) {
        return;
      }
      await onHighlightCreate(
        selectedVerses.start,
        selectedVerses.end,
        color,
        selectedVerses.startChar,
        selectedVerses.endChar,
        selectedVerses.selectedText,
      );

      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectedVerses(null);
      setShowColorPicker(false);
    },
    [selectedVerses, onHighlightCreate],
  );

  const handleHighlightClick = useCallback(
    (event: React.MouseEvent, highlight: Highlight) => {
      event.stopPropagation();
      event.preventDefault();

      // Clear any text selection
      window.getSelection()?.removeAllRanges();

      // Close color picker if open
      setShowColorPicker(false);
      setSelectedVerses(null);

      // Show menu for the clicked highlight
      setSelectedHighlight(highlight);
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      setMenuPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 5,
      });
      setShowHighlightMenu(true);
    },
    [],
  );

  const handleHighlightColorChange = useCallback(
    async (color: HighlightColor) => {
      if (!selectedHighlight || !onHighlightUpdate) return;

      await onHighlightUpdate(selectedHighlight.highlight_id, color);
      // Don't close menu here - let HighlightMenu handle it
    },
    [selectedHighlight, onHighlightUpdate],
  );

  const handleHighlightDeleteConfirm = useCallback(async () => {
    if (!selectedHighlight || !onHighlightDelete) return;

    await onHighlightDelete(selectedHighlight.highlight_id);
    // Don't close menu here - let HighlightMenu handle it
  }, [selectedHighlight, onHighlightDelete]);

  const getVerseHighlights = useCallback(
    (verseNumber: number) => {
      return highlights.filter(
        (h) =>
          verseNumber >= h.start_verse &&
          verseNumber <= h.end_verse &&
          h.chapter_id === chapterId,
      );
    },
    [highlights, chapterId],
  );

  const renderHighlightedText = useCallback(
    (verseText: string, verseNumber: number) => {
      const verseHighlights = getVerseHighlights(verseNumber);

      if (verseHighlights.length === 0) {
        return verseText;
      }

      // Create segments with highlight info
      interface TextSegment {
        start: number;
        end: number;
        text: string;
        highlight?: Highlight;
      }

      const segments: TextSegment[] = [];
      const highlights = verseHighlights
        .map((h) => ({
          highlight: h,
          start:
            h.start_verse === verseNumber
              ? h.start_char !== undefined
                ? h.start_char
                : 0
              : 0,
          end:
            h.end_verse === verseNumber
              ? h.end_char !== undefined
                ? h.end_char
                : verseText.length
              : verseText.length,
        }))
        .sort((a, b) => a.start - b.start);

      let currentPos = 0;

      // FIX: Improved segment creation logic to handle edge cases
      highlights.forEach(({ highlight, start, end }) => {
        // Validate start and end positions
        const validStart = Math.max(0, Math.min(start, verseText.length));
        const validEnd = Math.max(validStart, Math.min(end, verseText.length));

        // Add un highlighted text before this highlight
        if (currentPos < validStart) {
          segments.push({
            start: currentPos,
            end: validStart,
            text: verseText.slice(currentPos, validStart),
          });
        }

        // Add highlighted text
        if (validStart < validEnd) {
          segments.push({
            start: validStart,
            end: validEnd,
            text: verseText.slice(validStart, validEnd),
            highlight,
          });
        }

        currentPos = Math.max(currentPos, validEnd);
      });

      // Add remaining un highlighted text
      if (currentPos < verseText.length) {
        segments.push({
          start: currentPos,
          end: verseText.length,
          text: verseText.slice(currentPos),
        });
      }

      return segments.map((segment) => {
        if (segment.highlight) {
          const highlightClass = `${(styles as any).highlightedText} ${(styles as any)[`highlight${segment.highlight.color.charAt(0).toUpperCase()}${segment.highlight.color.slice(1)}`] || ""} ${(styles as any).clickable}`;
          return (
            <span
              key={`highlight-${segment.highlight.highlight_id}-${segment.start}-${segment.end}`}
              className={highlightClass}
              onClick={(e) =>
                segment.highlight && handleHighlightClick(e, segment.highlight)
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && segment.highlight) {
                  handleHighlightClick(e as any, segment.highlight);
                }
              }}
              aria-label={`Highlighted text: ${segment.text}`}
            >
              {segment.text}
            </span>
          );
        }
        return (
          <span key={`text-${segment.start}-${segment.end}`}>
            {segment.text}
          </span>
        );
      });
    },
    [getVerseHighlights, handleHighlightClick],
  );

  useEffect(() => {
    const container = versesContainerRef.current;
    if (!container) return;

    container.addEventListener("mouseup", handleTextSelection);
    container.addEventListener("touchend", handleTextSelection);

    return () => {
      container.removeEventListener("mouseup", handleTextSelection);
      container.removeEventListener("touchend", handleTextSelection);
    };
  }, [handleTextSelection]);

  return (
    <section className={styles.contentBox} ref={versesContainerRef}>
      <div className={styles.titleContainer}>
        <h1 className={styles.title}>
          {bookName} {text.chapterNumber}
        </h1>
        <div className={styles.actionButtons}>
          {bookId && testament && (
            <BookmarkButton
              bookId={bookId}
              chapterNumber={text.chapterNumber}
              bookName={bookName}
              testament={testament}
              className={styles.bookmarkButton}
            />
          )}
          {bookId && (
            <NotesButton
              bookId={Number(bookId)}
              chapterNumber={text.chapterNumber}
              bookName={bookName}
            />
          )}
          <CopyLinkButton
            className={styles.copyLinkButton}
            url={shareUrl}
            variant="icon"
          />
          <ShareButton
            url={shareUrl}
            title={`${bookName} ${text.chapterNumber}`}
            text={`Read ${bookName} chapter ${text.chapterNumber} on VerseMate`}
            variant="icon"
          />
        </div>
      </div>

      {text.subtitles.map((subtitle) => (
        <div key={subtitle.subtitle} className={styles.textBox}>
          <div className={styles.subtitleBox}>
            <h2 className={styles.subtitle}>
              {formatSubtitle(subtitle.subtitle)}
            </h2>
            <p className={styles.description}>
              ({bookName} {text.chapterNumber}:{subtitle.start_verse} -{" "}
              {subtitle.end_verse})
            </p>
          </div>
          <div className={styles.versesContainer}>
            {text.verses
              .filter(
                (verse) =>
                  verse.verseNumber >= subtitle.start_verse &&
                  verse.verseNumber <= subtitle.end_verse,
              )
              .map((verse) => {
                return (
                  <span
                    key={verse.verseNumber}
                    className={`${styles.verse}`}
                    data-verse-number={verse.verseNumber}
                  >
                    <sup className={styles.verseNumber}>
                      {verse.verseNumber}
                    </sup>
                    <span className={styles.verseText}>
                      {renderHighlightedText(verse.text, verse.verseNumber)}
                    </span>
                  </span>
                );
              })}
          </div>
        </div>
      ))}

      {showColorPicker && (
        <HighlightColorPicker
          position={pickerPosition}
          onColorSelect={handleHighlightCreate}
          onCancel={() => {
            setShowColorPicker(false);
            setSelectedVerses(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {showHighlightMenu && selectedHighlight && (
        <HighlightMenu
          highlightId={selectedHighlight.highlight_id}
          currentColor={selectedHighlight.color}
          onColorChange={handleHighlightColorChange}
          onDelete={handleHighlightDeleteConfirm}
          onClose={() => {
            setShowHighlightMenu(false);
            setSelectedHighlight(null);
          }}
          position={menuPosition}
        />
      )}
    </section>
  );
};

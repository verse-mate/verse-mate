import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAutoHighlights } from "../../../../hooks/useAutoHighlights";
import { useBookmarks } from "../../../../hooks/useBookmarks";
import { useGetSearchParams } from "../../../../hooks/useSearchParams";
import { userSession } from "../../../../hooks/userSession";
import { notify } from "../../../../notification";
import { fontSizeStore } from "../../../../store/font-size";
import {
  generateShareableUrl,
  getPassageTitle,
} from "../../../../utils/sharing";
import { AutoHighlightTooltip } from "../../../AutoHighlightTooltip";
import { BookOverviewButton } from "../../../BookOverviewButton";
import { BookmarkButton } from "../../../Bookmarks";
import { CopyLinkButton } from "../../../CopyLinkButton";
import { DictionaryPopover } from "../../../DictionaryPopover";
import type { HighlightColor } from "../../../HighlightColorPicker/types";
import { HighlightMenu } from "../../../HighlightMenu";
import { NotesButton } from "../../../Notes/NotesButton";
import { NotesModal } from "../../../Notes/NotesModal";
import { ShareButton } from "../../../ShareButton";
import { showSignInRequiredModal } from "../../../SignInRequiredModal";
import { VerseActionsMenu } from "../../../VerseActionsMenu";
import styles from "./text.module.css";
import type { AutoHighlight, Highlight, TextProps } from "./types";

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
  const { session } = userSession();
  const userFontSize = useSyncExternalStore(fontSizeStore.subscribe, () =>
    fontSizeStore.get(),
  );
  const {
    isBookmarked: checkIfBookmarked,
    addBookmark,
    removeBookmark,
    savePendingBookmark,
  } = useBookmarks();

  const [selectedVerses, setSelectedVerses] = useState<{
    start: number;
    end: number;
    startChar?: number;
    endChar?: number;
    selectedText?: string;
  } | null>(null);
  const [showVerseActionsMenu, setShowVerseActionsMenu] = useState(false);
  const [verseActionsPosition, setVerseActionsPosition] = useState({
    x: 0,
    y: 0,
  });
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showNotesModal, setShowNotesModal] = useState(false);
  const versesContainerRef = useRef<HTMLDivElement>(null);

  // Dictionary state
  const [dictionaryState, setDictionaryState] = useState<{
    open: boolean;
    strongsNum: string | null;
    position: { x: number; y: number };
  }>({
    open: false,
    strongsNum: null,
    position: { x: 0, y: 0 },
  });
  const [selectedWord, setSelectedWord] = useState<string | undefined>();

  // Auto-highlights state
  const [selectedAutoHighlight, setSelectedAutoHighlight] =
    useState<AutoHighlight | null>(null);
  const [showAutoHighlightTooltip, setShowAutoHighlightTooltip] =
    useState(false);
  const [autoHighlightMenuPosition, setAutoHighlightMenuPosition] = useState({
    x: 0,
    y: 0,
  });

  // Fetch auto-highlights for this chapter
  const { autoHighlights = [] } = useAutoHighlights({
    bookId,
    chapterNumber: text.chapterNumber,
    userId: session?.id,
  });

  const isBookmarked =
    bookId && chapterId ? checkIfBookmarked(bookId, chapterId) : false;

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

      // Check if selection is a single word for dictionary feature
      const isSingleWord =
        selectedText &&
        !/\s/.test(selectedText.trim()) &&
        selectedText.trim().length > 0;
      setSelectedWord(isSingleWord ? selectedText.trim() : undefined);

      // Position verse actions menu near selection
      const rect = range.getBoundingClientRect();
      setVerseActionsPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 10,
      });
      setShowVerseActionsMenu(true);
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
      setShowVerseActionsMenu(false);
    },
    [selectedVerses, onHighlightCreate],
  );

  const handleHighlightClick = useCallback(
    (event: React.MouseEvent, highlight: Highlight) => {
      event.stopPropagation();
      event.preventDefault();

      // Clear any text selection
      window.getSelection()?.removeAllRanges();

      // Close verse actions menu if open
      setShowVerseActionsMenu(false);
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

  // Verse Actions Menu handlers
  const handleVerseBookmark = useCallback(async () => {
    if (!bookId || !chapterId) return;

    // If user is not logged in, show login required modal and save bookmark intention
    if (!session) {
      // Save this chapter as a pending bookmark in localStorage
      savePendingBookmark(bookId, chapterId, bookName, testament || "");

      // Show login modal
      showSignInRequiredModal(
        "Bookmarks",
        "Bookmarking is only available for signed-in accounts. We've saved this chapter for you and will add it to your bookmarks as soon as you log in.",
      );
      return;
    }

    // User is logged in, toggle bookmark
    try {
      if (isBookmarked) {
        await removeBookmark(bookId, chapterId);
        notify({
          content: "Bookmark removed",
          color: "var(--success)",
        });
      } else {
        await addBookmark(bookId, chapterId, bookName, testament || "");
        notify({
          content: "Bookmark added",
          color: "var(--success)",
        });
      }
    } catch (_error) {
      notify({
        content: "Failed to update bookmark",
        color: "var(--error)",
      });
    }
  }, [
    bookId,
    chapterId,
    bookName,
    testament,
    session,
    isBookmarked,
    addBookmark,
    removeBookmark,
    savePendingBookmark,
  ]);

  const handleVerseNote = useCallback(async () => {
    if (!selectedVerses || !bookId || !chapterId) return;

    // Check if user is authenticated
    if (!session) {
      showSignInRequiredModal(
        "Notes",
        "Notes are available only for signed-in accounts. Please sign in to add, view, or edit notes for verses.",
      );
      return;
    }

    // Open notes modal
    setShowNotesModal(true);
  }, [selectedVerses, bookId, chapterId, session]);

  const handleVerseCopy = useCallback(async () => {
    if (!selectedVerses) return;

    try {
      await navigator.clipboard.writeText(selectedVerses.selectedText || "");
      notify({
        content: "Verse copied to clipboard",
        color: "var(--success)",
      });
    } catch (error) {
      console.error("Failed to copy verse:", error);
      notify({
        content: "Failed to copy verse",
        color: "var(--error)",
      });
    }
  }, [selectedVerses]);

  const handleVerseShare = useCallback(async () => {
    if (!selectedVerses || !bookId) return;

    const shareUrl = generateShareableUrl({
      bookId: String(bookId),
      chapterNumber: text.chapterNumber,
      startVerse: selectedVerses.start,
      endVerse: selectedVerses.end,
      testament: testament ?? null,
      explanationType: searchParams.explanationType ?? null,
      bibleVersion: searchParams.bibleVersion ?? null,
    });

    const title = getPassageTitle(
      {
        chapterNumber: text.chapterNumber,
        startVerse: selectedVerses.start,
        endVerse: selectedVerses.end,
      },
      bookName,
    );

    try {
      // Check if Web Share API is available (typically on mobile)
      if (navigator.share) {
        await navigator.share({
          title,
          text: selectedVerses.selectedText || "",
          url: shareUrl,
        });
        notify({
          content: "Shared successfully",
          color: "var(--success)",
        });
      } else {
        // Fallback to clipboard copy (typically on desktop)
        await navigator.clipboard.writeText(shareUrl);
        notify({
          content: "Share link copied to clipboard",
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
        content: "Failed to share verse",
        color: "var(--error)",
      });
    }
  }, [
    selectedVerses,
    bookId,
    text.chapterNumber,
    testament,
    searchParams,
    bookName,
  ]);

  const handleDefine = useCallback(
    (strongsNum: string) => {
      setDictionaryState({
        open: true,
        strongsNum,
        position: verseActionsPosition,
      });
      setShowVerseActionsMenu(false);
      setSelectedVerses(null);
      window.getSelection()?.removeAllRanges();
    },
    [verseActionsPosition],
  );

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

  const getVerseAutoHighlights = useCallback(
    (verseNumber: number) => {
      if (!autoHighlights || !Array.isArray(autoHighlights)) {
        return [];
      }
      return autoHighlights.filter(
        (h) => verseNumber >= h.start_verse && verseNumber <= h.end_verse,
      );
    },
    [autoHighlights],
  );

  const handleAutoHighlightClick = useCallback(
    (e: React.MouseEvent, autoHighlight: AutoHighlight) => {
      e.stopPropagation();
      const { clientX, clientY } = e;
      const x = clientX;
      const y = clientY + window.scrollY; // account for scroll to place tooltip at cursor
      setAutoHighlightMenuPosition({ x, y });
      setSelectedAutoHighlight(autoHighlight);
      setShowAutoHighlightTooltip(true);
    },
    [],
  );

  const handleSaveAsUserHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!selectedAutoHighlight || !onHighlightCreate) return;

      try {
        await onHighlightCreate(
          selectedAutoHighlight.start_verse,
          selectedAutoHighlight.end_verse,
          color,
          undefined, // No char positions for auto-highlights
          undefined,
          undefined,
        );
        setShowAutoHighlightTooltip(false);
        setSelectedAutoHighlight(null);
        notify({
          content: "Highlight saved to your collection!",
          color: "var(--success)",
        });
      } catch (error) {
        console.error("Failed to save highlight:", error);
        notify({
          content: "Failed to save highlight",
          color: "var(--error)",
        });
      }
    },
    [selectedAutoHighlight, onHighlightCreate],
  );

  const renderHighlightedText = useCallback(
    (verseText: string, verseNumber: number) => {
      const verseHighlights = getVerseHighlights(verseNumber);
      const verseAutoHighlights = getVerseAutoHighlights(verseNumber);

      // User highlights take priority over auto-highlights
      if (verseHighlights.length === 0 && verseAutoHighlights.length === 0) {
        return verseText;
      }

      // If user has highlighted this verse, show user highlight only
      if (verseHighlights.length > 0) {
        // Existing user highlight logic (keep as is)
        return renderUserHighlights(verseText, verseNumber, verseHighlights);
      }

      // Otherwise, show auto-highlight if available
      if (verseAutoHighlights.length > 0) {
        return renderAutoHighlights(verseText, verseAutoHighlights);
      }

      return verseText;
    },
    [getVerseHighlights, getVerseAutoHighlights],
  );

  // Helper function to render user highlights (existing logic)
  const renderUserHighlights = useCallback(
    (verseText: string, verseNumber: number, verseHighlights: Highlight[]) => {
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
    [handleHighlightClick],
  );

  // Helper function to render auto-highlights
  const renderAutoHighlights = useCallback(
    (verseText: string, autoHighlights: AutoHighlight[]) => {
      // If multiple auto-highlights for the same verse, use highest priority (lowest theme_id)
      // Use a copy to avoid mutating source array
      const primaryAutoHighlight = [...autoHighlights].sort(
        (a, b) => a.theme_id - b.theme_id,
      )[0];

      const capitalizedColor =
        primaryAutoHighlight.theme_color.charAt(0).toUpperCase() +
        primaryAutoHighlight.theme_color.slice(1);
      const autoHighlightClass = `${(styles as any)[`autoHighlight${capitalizedColor}`]}`;

      return (
        <span
          className={autoHighlightClass}
          onClick={(e) => handleAutoHighlightClick(e, primaryAutoHighlight)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleAutoHighlightClick(e as any, primaryAutoHighlight);
            }
          }}
          aria-label={`AI-generated highlight: ${primaryAutoHighlight.theme_name}`}
        >
          {verseText}
        </span>
      );
    },
    [handleAutoHighlightClick],
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

  // Scroll to verse if param is present
  useEffect(() => {
    if (searchParams.verse && versesContainerRef.current) {
      const verseElement = versesContainerRef.current.querySelector(
        `[data-verse-number="${searchParams.verse}"]`,
      );
      if (verseElement) {
        verseElement.scrollIntoView({ behavior: "smooth", block: "center" });

        // Highlight the verse temporarily
        verseElement.animate(
          [
            { backgroundColor: "transparent" },
            { backgroundColor: "rgba(176, 154, 109, 0.2)" },
            { backgroundColor: "transparent" },
          ],
          {
            duration: 2000,
            iterations: 1,
          },
        );
      }
    }
  }, [searchParams.verse]);

  return (
    <section className={styles.contentBox} ref={versesContainerRef}>
      <div className={styles.titleContainer}>
        <h1 className={styles.title} data-tour="chapter-title">
          {bookName} {text.chapterNumber}
        </h1>
        <div className={styles.actionButtons} data-tour="action-buttons">
          {bookId && typeof bookId === "number" && (
            <BookOverviewButton bookId={bookId} />
          )}
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

      {text.subtitles && text.subtitles.length > 0 ? (
        text.subtitles.map((subtitle, index) => (
          <div
            key={subtitle.subtitle}
            className={styles.textBox}
            data-tour={index === 0 ? "chapter-content" : undefined}
          >
            <div className={styles.subtitleBox}>
              <h2 className={styles.subtitle}>
                {formatSubtitle(subtitle.subtitle)}
              </h2>
              <p className={styles.description}>
                ({bookName} {text.chapterNumber}:{subtitle.start_verse} -{" "}
                {subtitle.end_verse})
              </p>
            </div>
            <div
              className={styles.versesContainer}
              style={{ fontSize: userFontSize }}
            >
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
        ))
      ) : (
        // Fallback: render all verses without subtitle grouping
        <div className={styles.textBox} data-tour="chapter-content">
          <div
            className={styles.versesContainer}
            style={{ fontSize: userFontSize }}
          >
            {text.verses.map((verse) => {
              return (
                <span
                  key={verse.verseNumber}
                  className={`${styles.verse}`}
                  data-verse-number={verse.verseNumber}
                >
                  <sup className={styles.verseNumber}>{verse.verseNumber}</sup>
                  <span className={styles.verseText}>
                    {renderHighlightedText(verse.text, verse.verseNumber)}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {showVerseActionsMenu && selectedVerses && (
        <VerseActionsMenu
          position={verseActionsPosition}
          selection={selectedVerses}
          isBookmarked={isBookmarked}
          onHighlight={handleHighlightCreate}
          onBookmark={handleVerseBookmark}
          onNote={handleVerseNote}
          onCopy={handleVerseCopy}
          onShare={handleVerseShare}
          onDefine={handleDefine}
          selectedWord={selectedWord}
          onClose={() => {
            setShowVerseActionsMenu(false);
            setSelectedVerses(null);
            setSelectedWord(undefined);
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

      {showAutoHighlightTooltip && selectedAutoHighlight && (
        <AutoHighlightTooltip
          highlight={selectedAutoHighlight}
          position={autoHighlightMenuPosition}
          onClose={() => {
            setShowAutoHighlightTooltip(false);
            setSelectedAutoHighlight(null);
          }}
          onSaveAsUserHighlight={handleSaveAsUserHighlight}
          isLoggedIn={!!session?.id}
        />
      )}

      {dictionaryState.open && dictionaryState.strongsNum && (
        <DictionaryPopover
          strongsNum={dictionaryState.strongsNum}
          position={dictionaryState.position}
          onClose={() =>
            setDictionaryState({ ...dictionaryState, open: false })
          }
        />
      )}

      {showNotesModal && bookId && chapterId && (
        <NotesModal
          bookId={bookId}
          chapterNumber={chapterId}
          bookName={bookName}
          onClose={() => setShowNotesModal(false)}
        />
      )}
    </section>
  );
};

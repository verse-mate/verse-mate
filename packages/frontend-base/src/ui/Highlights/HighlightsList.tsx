import { useEffect, useMemo, useState } from "react";
import { HIGHLIGHT_COLORS } from "../../constants/highlightColors";
import { fetchAllTestaments } from "../../hooks/useBible";
import { type Highlight, useHighlights } from "../../hooks/useHighlights";
import { useSaveSearchParams } from "../../hooks/useSearchParams";
import { updateSelectedBook } from "../../store/book-selection";
import * as Icon from "../Icons";
import styles from "./highlights.module.css";

/**
 * Type for grouped highlights by chapter
 */
interface ChapterGroup {
  key: string;
  bookId: number;
  chapterNumber: number;
  bookName: string;
  testament: string;
  highlights: Highlight[];
}

export const HighlightsList = () => {
  const { highlights, loading, error, deleteHighlight } = useHighlights();
  const { saveSearchParams } = useSaveSearchParams();
  const [removingIds, setRemovingIds] = useState<Record<number, boolean>>({});

  // Start with all chapters collapsed by default
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(
    new Set(),
  );

  // Get Bible book data to determine testament and names
  const { testaments } = fetchAllTestaments();

  /**
   * Group highlights by chapter
   */
  const chapterGroups = useMemo(() => {
    if (!highlights.length || !testaments) return [];

    const groups = new Map<string, ChapterGroup>();

    for (const highlight of highlights) {
      const bookId = highlight.book_id;
      const chapterNumber = highlight.chapter_number;
      const key = `${bookId}-${chapterNumber}`;

      if (!groups.has(key)) {
        const bookData = testaments.find((b) => b.b === bookId);
        groups.set(key, {
          key,
          bookId,
          chapterNumber,
          bookName: bookData?.n || `Book ${bookId}`,
          testament: bookData?.t || "OT",
          highlights: [],
        });
      }

      groups.get(key)?.highlights.push(highlight);
    }

    // Convert to array and sort by testament, then book, then chapter
    return Array.from(groups.values()).sort((a, b) => {
      // Sort by testament: OT before NT
      if (a.testament !== b.testament) {
        return a.testament === "OT" ? -1 : 1;
      }
      // Then sort by book ID
      if (a.bookId !== b.bookId) {
        return a.bookId - b.bookId;
      }
      // Finally sort by chapter
      return a.chapterNumber - b.chapterNumber;
    });
  }, [highlights, testaments]);

  // Update collapsed chapters when highlights change
  useEffect(() => {
    if (!loading && chapterGroups.length > 0) {
      // Only update if we don't have any collapsed state yet
      setCollapsedChapters((prev) => {
        if (prev.size === 0) {
          const allKeys = new Set<string>();
          chapterGroups.forEach((g) => allKeys.add(g.key));
          return allKeys; // All chapters collapsed by default
        }
        return prev;
      });
    }
  }, [chapterGroups, loading]);

  const toggleChapter = (chapterKey: string) => {
    const newCollapsed = new Set(collapsedChapters);
    if (newCollapsed.has(chapterKey)) {
      newCollapsed.delete(chapterKey);
    } else {
      newCollapsed.add(chapterKey);
    }
    setCollapsedChapters(newCollapsed);
  };

  const handleHighlightClick = (group: ChapterGroup, highlight: Highlight) => {
    if (group.bookName) {
      updateSelectedBook(group.bookName);
    }

    saveSearchParams({
      bookId: String(group.bookId),
      verseId: String(group.chapterNumber),
      testament: group.testament,
      verse: String(highlight.start_verse),
    });
  };

  const handleRemoveHighlight = async (
    e: React.MouseEvent,
    highlight: Highlight,
    bookName: string,
  ) => {
    e.stopPropagation();

    const id = highlight.highlight_id;
    setRemovingIds((prev) => ({ ...prev, [id]: true }));

    try {
      await deleteHighlight(id, bookName);
    } finally {
      setRemovingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const getHexColor = (colorName: string) => {
    return (
      HIGHLIGHT_COLORS.find((c) => c.color === colorName)?.hex || "#FEF3C7"
    );
  };

  if (loading && !highlights.length) {
    return <div className={styles.loading}>Loading highlights...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (chapterGroups.length === 0) {
    return (
      <div className={styles.empty}>
        No highlights yet. Start highlighting verses to see them here!
      </div>
    );
  }

  return (
    <div className={styles.highlightList}>
      {chapterGroups.map((group) => {
        const isCollapsed = collapsedChapters.has(group.key);

        return (
          <div key={group.key} className={styles.chapterGroup}>
            <button
              type="button"
              className={styles.chapterHeader}
              onClick={() => toggleChapter(group.key)}
            >
              <div className={styles.chapterTitle}>
                <Icon.PencilIcon style={{ width: 14, height: 14 }} />
                <span>
                  {group.bookName} {group.chapterNumber}
                </span>
                <span className={styles.countBadge}>
                  {group.highlights.length}
                </span>
              </div>
              <Icon.ChevronRightIcon
                className={`${styles.chevronIcon} ${!isCollapsed ? styles.chevronExpanded : ""}`}
              />
            </button>

            {!isCollapsed && (
              <div className={styles.highlightsContainer}>
                {group.highlights
                  .sort((a, b) => a.start_verse - b.start_verse)
                  .map((highlight) => {
                    const isRemoving = removingIds[highlight.highlight_id];
                    const reference =
                      highlight.start_verse === highlight.end_verse
                        ? `Verse ${highlight.start_verse}`
                        : `Verses ${highlight.start_verse}-${highlight.end_verse}`;

                    return (
                      <div
                        key={highlight.highlight_id}
                        className={styles.highlightItem}
                        onClick={() => handleHighlightClick(group, highlight)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleHighlightClick(group, highlight);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={styles.highlightContent}>
                          <div className={styles.highlightReference}>
                            <span
                              className={styles.colorIndicator}
                              style={{
                                backgroundColor: getHexColor(highlight.color),
                              }}
                            />
                            {reference}
                          </div>
                          <div className={styles.highlightText}>
                            {highlight.selected_text || "Highlighted passage"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={(e) =>
                            handleRemoveHighlight(e, highlight, group.bookName)
                          }
                          disabled={isRemoving}
                          aria-label="Remove highlight"
                        >
                          {isRemoving ? (
                            <span>...</span>
                          ) : (
                            <Icon.CloseIcon style={{ width: 14, height: 14 }} />
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

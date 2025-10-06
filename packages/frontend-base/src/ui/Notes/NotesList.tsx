import { useEffect, useMemo, useState } from "react";
import { useNotesContext } from "../../contexts/NotesContext";
import type { Note } from "../../hooks/useNotes";
import * as Icon from "../Icons";
import { NoteViewModal } from "./NoteViewModal";
import styles from "./notes.module.css";

// Utility function to truncate note content to 1-2 lines
const truncateNote = (
  content: string,
  maxLength = 80,
): { truncated: string; isTruncated: boolean } => {
  if (content.length <= maxLength) {
    return { truncated: content, isTruncated: false };
  }

  // Find a good breaking point near the limit
  let truncated = content.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // Break at word boundary if possible
  if (lastSpace > maxLength * 0.7) {
    truncated = truncated.substring(0, lastSpace);
  }

  return {
    truncated: `${truncated.trim()}...`,
    isTruncated: true,
  };
};

export const NotesList = () => {
  const { notes, isLoading, deleteNote } = useNotesContext();
  // Start with all chapters collapsed by default
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedNoteStartEditing, setSelectedNoteStartEditing] =
    useState(false);

  // Update collapsed chapters when notes change to ensure all chapters start collapsed
  useEffect(() => {
    if (!isLoading && notes.length > 0) {
      const allChapterKeys = new Set<string>();
      notes.forEach((note) => {
        const key = `${note.bookName} ${note.chapterNumber}`;
        allChapterKeys.add(key);
      });

      // Only update if we don't have any collapsed state yet
      setCollapsedChapters((prev) => {
        if (prev.size === 0) {
          return allChapterKeys; // All chapters collapsed by default
        }
        return prev; // Keep existing state
      });
    }
  }, [notes, isLoading]);

  const toggleChapter = (chapterKey: string) => {
    const newCollapsed = new Set(collapsedChapters);
    if (newCollapsed.has(chapterKey)) {
      newCollapsed.delete(chapterKey);
    } else {
      newCollapsed.add(chapterKey);
    }
    setCollapsedChapters(newCollapsed);
  };

  const handleNoteClick = (note: Note) => {
    setSelectedNoteStartEditing(false);
    setSelectedNote(note);
  };

  const handleCloseModal = () => {
    setSelectedNote(null);
  };

  const handleDeleteNote = async (noteId: string) => {
    await deleteNote(noteId);
  };

  const handleDelete = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await handleDeleteNote(noteId);
  };

  const handleEditClick = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNote(note);
    setSelectedNoteStartEditing(true);
  };

  // Group notes by book and chapter - memoized to ensure fresh computation
  const groupedNotes = useMemo(() => {
    const groups = notes.reduce(
      (acc, note) => {
        const key = `${note.bookName} ${note.chapterNumber}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(note);
        return acc;
      },
      {} as Record<string, Note[]>,
    );

    return groups;
  }, [notes]);

  if (isLoading) {
    return <div className={styles.emptyState}>Loading notes...</div>;
  }

  return (
    <>
      {notes.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No notes yet</div>
          <div className={styles.emptyDescription}>
            Click on the notes icon next to chapter titles to add your first
            note.
          </div>
        </div>
      ) : (
        <div className={styles.notesMainContainer}>
          {Object.entries(groupedNotes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([groupKey, groupNotes]) => {
              const isCollapsed = collapsedChapters.has(groupKey);
              return (
                <div key={groupKey} className={styles.chapterGroup}>
                  <button
                    type="button"
                    className={styles.chapterToggle}
                    onClick={() => toggleChapter(groupKey)}
                  >
                    <h3 className={styles.groupHeader}>
                      {groupKey} ({groupNotes.length} note
                      {groupNotes.length !== 1 ? "s" : ""})
                    </h3>
                    <Icon.ChevronRightIcon
                      className={`${styles.chevronIcon} ${!isCollapsed ? styles.chevronExpanded : ""}`}
                    />
                  </button>

                  {!isCollapsed && (
                    <div className={styles.notesContainer}>
                      <ul className={styles.notesList}>
                        {groupNotes
                          .sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() -
                              new Date(a.createdAt).getTime(),
                          )
                          .map((noteFromGroup) => {
                            // Get the current note data from the notes array (like the modal does)
                            const currentNote =
                              notes.find((n) => n.id === noteFromGroup.id) ||
                              noteFromGroup;
                            const { isTruncated } = truncateNote(
                              currentNote.content,
                            );

                            return (
                              <li
                                key={currentNote.id}
                                className={styles.noteItem}
                              >
                                <div className={styles.noteHeader}>
                                  <div className={styles.noteActions}>
                                    <button
                                      type="button"
                                      className={styles.actionButton}
                                      onClick={(e) =>
                                        handleEditClick(currentNote, e)
                                      }
                                      aria-label="Edit note"
                                      title="Edit note"
                                    >
                                      <Icon.PencilSquareIcon
                                        fill="currentColor"
                                        width={24}
                                        height={24}
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.actionButton}
                                      onClick={(e) =>
                                        handleDelete(currentNote.id, e)
                                      }
                                      aria-label="Delete note"
                                      title="Delete note"
                                    >
                                      <Icon.TrashIcon width={28} height={28} />
                                    </button>
                                  </div>
                                </div>
                                <div
                                  className={`${styles.notePreview} ${styles.clickable}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleNoteClick(currentNote)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      handleNoteClick(currentNote);
                                    }
                                  }}
                                >
                                  <div
                                    className={`${styles.noteContent} ${styles.clamped}`}
                                  >
                                    {currentNote.content}
                                  </div>
                                  {isTruncated && (
                                    <span className={styles.readMore}>
                                      Click to read more
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
      {selectedNote && (
        <NoteViewModal
          note={notes.find((n) => n.id === selectedNote.id) || selectedNote}
          onClose={handleCloseModal}
          initialIsEditing={selectedNoteStartEditing}
        />
      )}
    </>
  );
};

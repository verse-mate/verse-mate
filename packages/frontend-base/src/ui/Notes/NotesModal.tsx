import { useState } from "react";
import { useNotesContext } from "../../contexts/NotesContext";
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

type NotesModalProps = {
  bookId: number;
  chapterNumber: number;
  bookName: string;
  onClose: () => void;
};

export const NotesModal = ({
  bookId,
  chapterNumber,
  bookName,
  onClose,
}: NotesModalProps) => {
  const { notes, addNote, updateNote, deleteNote } = useNotesContext();
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [selectedNoteStartEditing, setSelectedNoteStartEditing] =
    useState(false);
  const [overlayMouseDown, setOverlayMouseDown] = useState(false);

  // Filter notes for this chapter
  const chapterNotes = notes.filter(
    (note: any) =>
      note.bookId === bookId && note.chapterNumber === chapterNumber,
  );

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;

    addNote({
      bookId,
      chapterNumber,
      verseNumber: undefined,
      content: newNoteContent.trim(),
      bookName,
    });

    setNewNoteContent("");
  };

  const _handleEditNote = (noteId: string, content: string) => {
    setEditingNoteId(noteId);
    setEditContent(content);
  };

  const handleSaveEdit = () => {
    if (!editingNoteId || !editContent.trim()) return;

    updateNote(editingNoteId, editContent.trim());
    setEditingNoteId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent("");
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNote(noteId);
  };

  const _toggleNoteExpansion = (noteId: string) => {
    setExpandedNoteId(expandedNoteId === noteId ? null : noteId);
  };

  const openNoteView = (note: any, startEditing = false) => {
    setSelectedNote(note);
    setSelectedNoteStartEditing(startEditing);
  };

  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setOverlayMouseDown(true);
    }
  };

  const handleOverlayMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (overlayMouseDown && e.target === e.currentTarget) {
      onClose();
    }
    setOverlayMouseDown(false);
  };

  return (
    <div
      className={styles.modalOverlay}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div
        className={styles.modalContent}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Notes for {bookName} {chapterNumber}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
          >
            <Icon.CloseIcon />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Add new note section */}
          <div className={styles.addNoteSection}>
            <h3 className={styles.addNoteHeader}>Add New Note</h3>
            <textarea
              className={styles.addNoteTextarea}
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Write your note here..."
              rows={3}
            />
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAddNote}
              disabled={!newNoteContent.trim()}
            >
              Add Note
            </button>
          </div>

          {/* Existing notes */}
          <div className={styles.notesSection}>
            <h3 className={styles.sectionHeader}>
              Existing Notes ({chapterNotes.length})
            </h3>

            {chapterNotes.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>No notes yet</p>
                <p className={styles.emptyDescription}>
                  Add your first note for this chapter above.
                </p>
              </div>
            ) : (
              <div className={styles.notesList}>
                {chapterNotes.map((note: any) => (
                  <div key={note.id} className={styles.noteItem}>
                    {editingNoteId === note.id ? (
                      <div className={styles.editForm}>
                        <textarea
                          className={styles.editTextarea}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                        />
                        <div className={styles.editActions}>
                          <button
                            type="button"
                            className={styles.saveButton}
                            onClick={handleSaveEdit}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.noteHeader}>
                          <div className={styles.noteActions}>
                            <button
                              type="button"
                              className={styles.actionButton}
                              onClick={() => openNoteView(note, true)}
                              aria-label="Edit note"
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
                              onClick={() => handleDeleteNote(note.id)}
                              aria-label="Delete note"
                            >
                              <Icon.TrashIcon width={28} height={28} />
                            </button>
                          </div>
                        </div>
                        <div
                          className={`${styles.notePreview} ${styles.clickable}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => openNoteView(note, false)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openNoteView(note, false);
                            }
                          }}
                        >
                          {expandedNoteId === note.id ? (
                            <div className={styles.noteContent}>
                              {note.content}
                            </div>
                          ) : (
                            <>
                              {(() => {
                                const { isTruncated } = truncateNote(
                                  note.content,
                                );
                                return (
                                  <>
                                    <div
                                      className={`${styles.noteContent} ${styles.clamped}`}
                                    >
                                      {note.content}
                                    </div>
                                    {isTruncated ? (
                                      <span
                                        className={styles.readMore}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openNoteView(note, false);
                                        }}
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          ) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openNoteView(note, false);
                                          }
                                        }}
                                      >
                                        Click to read more
                                      </span>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {selectedNote && (
          <NoteViewModal
            note={selectedNote}
            onClose={() => setSelectedNote(null)}
            initialIsEditing={selectedNoteStartEditing}
          />
        )}
      </div>
    </div>
  );
};

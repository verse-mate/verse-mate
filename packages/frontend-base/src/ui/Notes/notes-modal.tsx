import { api } from "backend-api";
// Using direct fetch calls to the existing endpoints to avoid regressions
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { userSession } from "../../hooks/userSession";
import { Button } from "../Button/Button";
import styles from "./NotesModal.module.css";

type Note = {
  note_id: string;
  user_id: string;
  book_name: string;
  chapter_number: number;
  content: string;
  created_at: string;
  updated_at: string;
};

// (No test override) — uses real session

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookName: string;
  chapterNumber: number;
  onNotesChange?: () => void; // Callback to notify parent when notes change
}

export const NotesModal: React.FC<NotesModalProps> = ({
  isOpen,
  onClose,
  bookName,
  chapterNumber,
  onNotesChange,
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const { session } = userSession();
  const effectiveUserId = session?.id;

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (api as any)
        .notes({ bookName })({ chapterNumber: String(chapterNumber) })
        .get();
      const fetchedNotes = res?.data?.notes ?? [];
      setNotes(fetchedNotes);
      return;
    } catch (err) {
      setError("Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [bookName, chapterNumber]);

  // Fetch notes when modal opens or dependencies change
  useEffect(() => {
    if (isOpen) {
      fetchNotes();
    }
  }, [isOpen, fetchNotes]);

  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) return;

    try {
      const res = await (api as any).notes.post({
        bookName,
        chapterNumber,
        content: newNoteContent.trim(),
      });
      const newNote = res?.data?.note ?? res?.data;
      if (!newNote?.note_id) throw new Error("Invalid note");
      setNotes((prev) => [newNote, ...prev]);
      setNewNoteContent("");
      onNotesChange?.();
      return;
    } catch (err) {
      setError("Failed to create note");
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      const res = await (api as any).notes({ noteId })("put")({
        content: editContent.trim(),
      });
      const updatedNote = res?.data?.note ?? res?.data;
      if (!updatedNote?.note_id) throw new Error("Invalid note");
      setNotes((prev) =>
        prev.map((note) => (note.note_id === noteId ? updatedNote : note)),
      );
      setEditingNoteId(null);
      setEditContent("");
      return;
    } catch (err) {
      setError("Failed to update note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await (api as any).notes({ noteId })("delete")();
      const success = res?.data?.success !== false;
      if (success) {
        setNotes((prev) => prev.filter((note) => note.note_id !== noteId));
        onNotesChange?.();
      } else {
        setError("Failed to delete note");
      }
      return;
    } catch (err) {
      setError("Failed to delete note");
    }
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.note_id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditContent("");
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="button"
      tabIndex={0}
      onMouseDown={onClose}
      onKeyDown={(e) => {
        // Only close on Escape and only if the overlay itself received the keydown
        if (e.key === "Escape" && e.currentTarget === e.target) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            Notes for {bookName} {chapterNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* Error message */}
          {error && <div className={styles.errorState}>{error}</div>}

          {/* Loading state */}
          {loading && (
            <div className={styles.loadingState}>Loading notes...</div>
          )}

          {/* Notes list */}
          {!loading && (
            <ul className={styles.notesList}>
              {notes.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No notes yet. Add your first note below.</p>
                  <small>
                    Your notes will appear here once you create them.
                  </small>
                </div>
              ) : (
                notes.map((note) => (
                  <li key={note.note_id} className={styles.noteItem}>
                    {editingNoteId === note.note_id ? (
                      <div className={styles.editForm}>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className={styles.editTextarea}
                          placeholder="Edit your note..."
                        />
                        <div className={styles.editActions}>
                          <Button
                            type="button"
                            onClick={() => handleUpdateNote(note.note_id)}
                            variant="contained"
                            color="#D4A474"
                            className={styles.smallButton}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            onClick={cancelEditing}
                            variant="contained"
                            color="#A0A0A0"
                            className={styles.smallButton}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={styles.noteContent}>{note.content}</p>
                        <div className={styles.noteActions}>
                          <Button
                            type="button"
                            onClick={() => startEditing(note)}
                            variant="contained"
                            color="#D4A474"
                            className={styles.smallButton}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleDeleteNote(note.note_id)}
                            variant="contained"
                            color="#A0A0A0"
                            className={styles.smallButton}
                          >
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}

          {/* Add new note form */}
          <div className={styles.newNoteForm}>
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className={styles.newNoteTextarea}
              placeholder="Add a new note..."
            />
            <div className={styles.addButtonContainer}>
              <Button
                type="button"
                onClick={handleCreateNote}
                disabled={!newNoteContent.trim()}
                variant="contained"
                color="#D4A474"
                className={styles.addButton}
              >
                Add Note
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

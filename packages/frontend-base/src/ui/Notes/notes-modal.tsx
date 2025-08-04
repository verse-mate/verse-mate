import type React from "react";
import { useEffect, useState } from "react";
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

  // Fetch notes when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchNotes();
    }
  }, [isOpen, bookName, chapterNumber]);

  const fetchNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("[NotesModal] Fetching notes for:", {
        bookName,
        chapterNumber,
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/notes/${bookName}/${chapterNumber}?userId=550e8400-e29b-41d4-a716-446655440000`,
      );
      const data = await response.json();
      const fetchedNotes = data.notes || [];
      setNotes(fetchedNotes);
    } catch (err) {
      console.error("[NotesModal] Error fetching notes:", err);
      setError("Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) return;

    try {
      console.log("[NotesModal] Creating note:", newNoteContent);
      const requestBody = {
        bookName,
        chapterNumber,
        content: newNoteContent.trim(),
        userId: "550e8400-e29b-41d4-a716-446655440000",
      };
      console.log("[NotesModal] Request body:", requestBody);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );

      console.log("[NotesModal] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[NotesModal] Error response:", errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();
      console.log("[NotesModal] Response data:", data);

      const newNote = data.note;

      if (!newNote) {
        console.error("[NotesModal] No note in response:", data);
        throw new Error("No note returned from server");
      }

      if (!newNote.note_id) {
        console.error("[NotesModal] Note missing note_id:", newNote);
        throw new Error("Note missing note_id");
      }

      console.log("[NotesModal] Successfully created note:", newNote);
      setNotes((prev) => [newNote, ...prev]);
      setNewNoteContent("");
      // Notify parent that notes have changed
      onNotesChange?.();
    } catch (err) {
      console.error("[NotesModal] Error creating note:", err);
      setError("Failed to create note");
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      console.log("[NotesModal] Updating note:", noteId, editContent);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/notes/${noteId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: editContent.trim(),
            userId: "550e8400-e29b-41d4-a716-446655440000",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const updatedNote = data.note || data;

      if (!updatedNote || !updatedNote.note_id) {
        throw new Error("Invalid note response from server");
      }

      setNotes((prev) =>
        prev.map((note) => (note.note_id === noteId ? updatedNote : note)),
      );
      setEditingNoteId(null);
      setEditContent("");
    } catch (err) {
      console.error("[NotesModal] Error updating note:", err);
      setError("Failed to update note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      console.log("[NotesModal] Deleting note:", noteId);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/notes/${noteId}?userId=550e8400-e29b-41d4-a716-446655440000`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const success = data.success !== false; // Consider any response as success unless explicitly false
      if (success) {
        setNotes((prev) => prev.filter((note) => note.note_id !== noteId));
        // Notify parent that notes have changed
        onNotesChange?.();
      } else {
        setError("Failed to delete note");
      }
    } catch (err) {
      console.error("[NotesModal] Error deleting note:", err);
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            Notes for {bookName} {chapterNumber}
          </h2>
          <button onClick={onClose} className={styles.closeButton}>
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
                            style={{
                              backgroundColor: "#D4A474",
                              color: "#000000",
                              border: "none",
                              borderRadius: "8px",
                              padding: "2px 12px",
                              fontSize: "14px",
                              fontWeight: "600",
                              height: "28px",
                              minHeight: "28px",
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            onClick={cancelEditing}
                            variant="contained"
                            style={{
                              backgroundColor: "#A0A0A0",
                              color: "#000000",
                              border: "none",
                              borderRadius: "8px",
                              padding: "2px 12px",
                              fontSize: "14px",
                              fontWeight: "600",
                              height: "28px",
                              minHeight: "28px",
                            }}
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
                            style={{
                              backgroundColor: "#D4A474",
                              color: "#000000",
                              border: "none",
                              borderRadius: "8px",
                              padding: "2px 12px",
                              fontSize: "14px",
                              fontWeight: "600",
                              height: "28px",
                              minHeight: "28px",
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleDeleteNote(note.note_id)}
                            variant="contained"
                            style={{
                              backgroundColor: "#A0A0A0",
                              color: "#000000",
                              border: "none",
                              borderRadius: "8px",
                              padding: "2px 12px",
                              fontSize: "14px",
                              fontWeight: "600",
                              height: "28px",
                              minHeight: "28px",
                            }}
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
                style={{
                  backgroundColor: "#D4A474",
                  color: "#000000",
                  border: "none",
                  borderRadius: "8px",
                  padding: "4px 24px",
                  fontSize: "14px",
                  fontWeight: "600",
                  width: "100%",
                  height: "32px",
                  minHeight: "32px",
                }}
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

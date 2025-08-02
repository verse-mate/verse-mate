import type React from "react";
import { useEffect, useState } from "react";
import { type Note, notesApi } from "../../api/notesApi";

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookName: string;
  chapterNumber: number;
  translation: string;
}

export const NotesModal: React.FC<NotesModalProps> = ({
  isOpen,
  onClose,
  bookName,
  chapterNumber,
  translation,
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
  }, [isOpen, bookName, chapterNumber, translation]);

  const fetchNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("[NotesModal] Fetching notes for:", {
        bookName,
        chapterNumber,
        translation,
      });
      const fetchedNotes = await notesApi.getNotes(
        bookName,
        chapterNumber,
        translation,
      );
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
      const newNote = await notesApi.createNote({
        bookName,
        chapterNumber,
        translation,
        content: newNoteContent.trim(),
      });
      setNotes((prev) => [newNote, ...prev]);
      setNewNoteContent("");
    } catch (err) {
      console.error("[NotesModal] Error creating note:", err);
      setError("Failed to create note");
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      console.log("[NotesModal] Updating note:", noteId, editContent);
      const updatedNote = await notesApi.updateNote(noteId, {
        content: editContent.trim(),
      });
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
      const success = await notesApi.deleteNote(noteId);
      if (success) {
        setNotes((prev) => prev.filter((note) => note.note_id !== noteId));
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
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#2c2c2c",
          borderRadius: "12px",
          padding: "20px",
          width: "90%",
          maxWidth: "480px",
          maxHeight: "75vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          border: "1px solid #444",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            borderBottom: "1px solid #555",
            paddingBottom: "12px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "400",
              color: "#ffffff",
            }}
          >
            Notes for {bookName} {chapterNumber}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#cccccc",
              padding: "0",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              padding: "8px 12px",
              borderRadius: "4px",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "#6b7280",
            }}
          >
            Loading notes...
          </div>
        )}

        {/* Notes list */}
        {!loading && (
          <div style={{ marginBottom: "20px" }}>
            {notes.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px",
                  color: "#cccccc",
                  fontStyle: "italic",
                }}
              >
                No notes yet. Add your first note below.
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.note_id}
                  style={{
                    border: "1px solid #555",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "10px",
                    backgroundColor: "#404040",
                  }}
                >
                  {editingNoteId === note.note_id ? (
                    <div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: "60px",
                          padding: "8px",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          fontSize: "14px",
                          fontFamily: "inherit",
                          resize: "vertical",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginTop: "8px",
                        }}
                      >
                        <button
                          onClick={() => handleUpdateNote(note.note_id)}
                          style={{
                            backgroundColor: "#007bff",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          style={{
                            backgroundColor: "#6c757d",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          lineHeight: "1.5",
                          marginBottom: "8px",
                          color: "#ffffff",
                        }}
                      >
                        {note.content}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#cccccc",
                          }}
                        >
                          {new Date(note.created_at).toLocaleDateString()}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            onClick={() => startEditing(note)}
                            style={{
                              backgroundColor: "#d4a574",
                              color: "#2c2c2c",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                              fontWeight: "500",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.note_id)}
                            style={{
                              backgroundColor: "#a0a0a0",
                              color: "#2c2c2c",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                              fontWeight: "500",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Add new note */}
        <div>
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Write a new note..."
            style={{
              width: "100%",
              minHeight: "60px",
              padding: "10px",
              border: "1px solid #555",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "inherit",
              resize: "vertical",
              marginBottom: "10px",
              backgroundColor: "#333",
              color: "#ffffff",
            }}
          />
          <button
            onClick={handleCreateNote}
            disabled={!newNoteContent.trim()}
            style={{
              backgroundColor: newNoteContent.trim() ? "#d4a574" : "#666",
              color: newNoteContent.trim() ? "#2c2c2c" : "#999",
              border: "none",
              padding: "10px 20px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: newNoteContent.trim() ? "pointer" : "not-allowed",
              width: "100%",
            }}
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
};

import { useState } from "react";
import { useNotesContext } from "../../contexts/NotesContext";
import * as Icon from "../Icons";
import styles from "./notes.module.css";

type NoteViewModalProps = {
  note: {
    id: string;
    content: string;
    bookName: string;
    chapterNumber: number;
    verseNumber?: number;
    createdAt: string;
    updatedAt: string;
  };
  onClose: () => void;
  initialIsEditing?: boolean;
};

export const NoteViewModal = ({
  note,
  onClose,
  initialIsEditing = false,
}: NoteViewModalProps) => {
  const { updateNote, deleteNote } = useNotesContext();
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editContent, setEditContent] = useState(note.content);
  const [overlayMouseDown, setOverlayMouseDown] = useState(false);

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;

    await updateNote(note.id, editContent.trim());
    setIsEditing(false);
    onClose();
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
    onClose();
  };

  const handleCancelEdit = () => {
    setEditContent(note.content);
    setIsEditing(false);
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
            {note.bookName} {note.chapterNumber}
            {note.verseNumber && `:${note.verseNumber}`}
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
          {isEditing ? (
            <div className={styles.editForm}>
              <textarea
                className={styles.editTextarea}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
              />
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim()}
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
              <div className={styles.noteViewContent}>{note.content}</div>
              <div className={styles.noteViewActions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit note"
                >
                  <Icon.PencilIcon />
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={handleDelete}
                  aria-label="Delete note"
                >
                  <Icon.TrashIcon />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

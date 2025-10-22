import { useState } from "react";
import { useNotesContext } from "../../contexts/NotesContext";
import { userSession } from "../../hooks/userSession";
import * as Icon from "../Icons";
import { showSignInRequiredModal } from "../SignInRequiredModal";
import { NotesModal } from "./NotesModal";
import styles from "./notes.module.css";

type NotesButtonProps = {
  bookId: number;
  chapterNumber: number;
  bookName: string;
  className?: string;
};

export const NotesButton = ({
  bookId,
  chapterNumber,
  bookName,
  className,
}: NotesButtonProps) => {
  const { notes } = useNotesContext();
  const { session } = userSession();
  const [showModal, setShowModal] = useState(false);

  // Check if this chapter has any notes
  const chapterNotes = notes.filter(
    (note: any) =>
      note.bookId === bookId && note.chapterNumber === chapterNumber,
  );
  const hasNotes = chapterNotes.length > 0;

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.id) {
      showSignInRequiredModal(
        "Notes",
        "Notes are available only for signed-in accounts. Please sign in to add, view, or edit notes for this chapter.",
      );
      return;
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.notesButton} ${hasNotes ? styles.hasNotes : ""} ${className || ""}`}
        onClick={handleOpenModal}
        aria-label={hasNotes ? "Open notes (has existing notes)" : "Open notes"}
        title={
          hasNotes
            ? `Open notes (${chapterNotes.length} existing)`
            : "Open notes"
        }
      >
        <Icon.NotesIcon className={hasNotes ? styles.hasNotesIcon : ""} />
      </button>

      {showModal && (
        <NotesModal
          bookId={bookId}
          chapterNumber={chapterNumber}
          bookName={bookName}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

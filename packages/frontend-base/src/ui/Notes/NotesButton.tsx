import { useState } from "react";
import { useNotesContext } from "../../contexts/NotesContext";
import { useHandleTab } from "../../hooks/useHandleTab";
import { userSession } from "../../hooks/userSession";
import { addModal, removeAllModals } from "../../modal/store";
import bmStyles from "../Bookmarks/bookmarks.module.css";
import * as Icon from "../Icons";
import { NotesModal } from "./NotesModal.tsx";
import styles from "./notes.module.css";

type NotesButtonProps = {
  bookId: number;
  chapterNumber: number;
  bookName: string;
  testament: string;
  className?: string;
};

export const NotesButton = ({
  bookId,
  chapterNumber,
  bookName,
  testament,
  className,
}: NotesButtonProps) => {
  const { notes } = useNotesContext();
  const { session } = userSession();
  const { setActiveTab } = useHandleTab();
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
      addModal({
        content: (
          <div className={bmStyles.loginModal}>
            <h3>Sign in Required to Use Notes</h3>
            <p>
              Notes are available only for signed-in accounts. Please sign in to
              add, view, or edit notes for this chapter.
            </p>
            <div className={bmStyles.loginModalButtons}>
              <button
                type="button"
                className={bmStyles.loginButton}
                onClick={() => {
                  // Open right panel login by switching to the menu tab
                  try {
                    localStorage.setItem("postRightPanelContent", "login");
                  } catch {}
                  // Notify MainContent to switch tab and open login immediately
                  try {
                    window.dispatchEvent(
                      new CustomEvent("openRightPanelContent", {
                        detail: "login",
                      }),
                    );
                    window.dispatchEvent(
                      new CustomEvent("setActiveTab", { detail: "menu" }),
                    );
                  } catch {}
                  // Fallback for older flows
                  try {
                    setActiveTab("menu");
                  } catch {}
                  removeAllModals();
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        ),
      });
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
          testament={testament}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

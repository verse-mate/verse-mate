import type React from "react";
import { useEffect, useState } from "react";
import { notesApi } from "../../../api/notesApi";
import { NotesModal } from "../../Notes/notes-modal";

// Feature flag for notes functionality
const isNotesEnabled = () => {
  // Check environment variable first
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_NOTES_ENABLED !== undefined
  ) {
    return process.env.NEXT_PUBLIC_NOTES_ENABLED === "true";
  }
  // Default to enabled in development, disabled in production
  return process.env.NODE_ENV === "development";
};

export interface NotesButtonProps {
  bookName: string;
  chapterNumber: number;
  translation: string;
  isAuthenticated?: boolean;
}

export const NotesButton: React.FC<NotesButtonProps> = ({
  bookName,
  chapterNumber,
  translation,
  isAuthenticated = true, // Default to true for development
}) => {
  console.log("[NotesButton] Received props:", {
    bookName,
    chapterNumber,
    translation,
    isAuthenticated,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);

  // Don't render if feature is disabled
  if (!isNotesEnabled()) {
    return null;
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Check if current chapter has notes
  useEffect(() => {
    const checkForNotes = async () => {
      if (!bookName || !chapterNumber || !translation || !isNotesEnabled()) {
        return;
      }

      try {
        const notes = await notesApi.getNotes(
          bookName,
          chapterNumber,
          translation,
        );
        setHasNotes(notes.length > 0);
        console.log(
          `[NotesButton] Found ${notes.length} notes for ${bookName} ${chapterNumber}`,
        );
      } catch (error) {
        console.error("[NotesButton] Error checking for notes:", error);
        setHasNotes(false);
      }
    };

    checkForNotes();
  }, [bookName, chapterNumber, translation]);

  const handleOpenModal = () => {
    console.log("[NotesButton] Opening notes modal for:", {
      bookName,
      chapterNumber,
      translation,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    console.log("[NotesButton] Closing notes modal");
    setIsModalOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        style={{
          borderRadius: "100px",
          padding: "2px 8px",
          backgroundColor: "#FFFFFF33",
          color: "var(--snow)",
          fontFamily: "Inter",
          fontSize: "14px",
          fontWeight: "500",
          lineHeight: "24px",
          border: "none",
          cursor: "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--dust)";
          e.currentTarget.style.color = "var(--night)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#FFFFFF33";
          e.currentTarget.style.color = "var(--snow)";
        }}
        title={hasNotes ? "Notes (has saved notes)" : "Notes"}
      >
        {/* Notes Icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Notes Icon</title>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10,9 9,9 8,9" />
        </svg>
        Notes
        {hasNotes && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              width: "8px",
              height: "8px",
              backgroundColor: "#007bff",
              borderRadius: "50%",
              border: "1px solid white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            }}
          />
        )}
      </button>

      <NotesModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        bookName={bookName}
        chapterNumber={chapterNumber}
        translation={translation}
      />
    </>
  );
};

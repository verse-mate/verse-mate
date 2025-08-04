import type React from "react";
import { useEffect, useState } from "react";
import { NotesIcon } from "../../Icons/notesIcon";
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

  // Function to check if current chapter has notes
  const checkForNotes = async () => {
    if (!bookName || !chapterNumber || !translation || !isNotesEnabled()) {
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/notes/${bookName}/${chapterNumber}?userId=550e8400-e29b-41d4-a716-446655440000`,
      );
      const data = await response.json();
      const notes = data.notes || [];
      setHasNotes(notes.length > 0);
      console.log(
        `[NotesButton] Found ${notes.length} notes for ${bookName} ${chapterNumber}`,
      );
    } catch (error) {
      console.error("[NotesButton] Error checking for notes:", error);
      setHasNotes(false);
    }
  };

  // Check if current chapter has notes when component mounts or chapter changes
  useEffect(() => {
    checkForNotes();
  }, [bookName, chapterNumber, translation]);

  // Callback to refresh notes count when notes are added/deleted from modal
  const handleNotesChange = () => {
    checkForNotes();
  };

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
        <NotesIcon width={16} height={16} fill="currentColor" />
        Notes
        {hasNotes && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              width: "8px",
              height: "8px",
              backgroundColor: "var(--brand)",
              borderRadius: "50%",
              border: "1px solid var(--snow)",
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
        onNotesChange={handleNotesChange}
      />
    </>
  );
};

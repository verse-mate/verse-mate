import { api } from "backend-api";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { userSession } from "../../../hooks/userSession";
import { Button } from "../../Button/Button";
import { NotesIcon } from "../../Icons/notesIcon";
import { NotesModal } from "../../Notes/notes-modal";
import styles from "./NotesButton.module.css";

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

// (No test override) — uses real session

export interface NotesButtonProps {
  bookName: string;
  chapterNumber: number;
  translation: string;
  isAuthenticated?: boolean;
  onRequireAuth?: () => void;
}

export const NotesButton: React.FC<NotesButtonProps> = ({
  bookName,
  chapterNumber,
  translation,
  isAuthenticated, // If undefined, we'll infer from cookie at runtime
  onRequireAuth,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);

  // Infer auth from cookie if not explicitly provided
  const hasAccessToken = () =>
    typeof document !== "undefined" &&
    /(?:^|; )accessToken=/.test(document.cookie);
  const authed = isAuthenticated ?? hasAccessToken();

  // Current user session (for user-specific notes)
  const { session } = userSession();

  // Effective user id and auth (real session only)
  const effectiveUserId = session?.id;
  const isAuthedForNotes = authed;

  // Don't render if feature is disabled
  if (!isNotesEnabled()) {
    return null;
  }

  // No hardcoded login; require real authentication

  // Function to check if current chapter has notes
  const checkForNotes = useCallback(async () => {
    if (!bookName || !chapterNumber || !isNotesEnabled()) {
      return;
    }

    try {
      const response = await fetch(
        `/api/notes/${encodeURIComponent(bookName)}/${chapterNumber}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${document.cookie.match(/(?:^|; )accessToken=([^;]+)/)?.[1] || ""}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        // Keep previous state on unexpected errors to avoid visual flicker
        return;
      }

      const data = await response.json();
      const notes = data?.notes ?? [];
      setHasNotes((notes?.length ?? 0) > 0);
    } catch (error) {
      // Keep previous state on unexpected errors to avoid visual flicker
      return;
    }
  }, [bookName, chapterNumber]);

  // Check if current chapter has notes when component mounts or chapter changes
  useEffect(() => {
    checkForNotes();
  }, [checkForNotes]);

  // Callback to refresh notes count when notes are added/deleted from modal
  const handleNotesChange = () => {
    // Optimistically assume there are notes after an add, and re-validate
    setHasNotes(true);
    // Defer server check to avoid flicker and allow backend to persist
    setTimeout(() => {
      checkForNotes();
    }, 600);
  };

  const handleOpenModal = () => {
    if (!isAuthedForNotes) {
      // Route to sign-in/menu using provided callback, else fallback
      if (onRequireAuth) onRequireAuth();
      else window.location.href = "/login";
      return;
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Button
        className={`${styles.button} ${!isAuthedForNotes || !hasNotes ? styles.muted : ""}`}
        format="rounded"
        variant={isAuthedForNotes && hasNotes ? "contained" : "ghost"}
        color={isAuthedForNotes && hasNotes ? "var(--dust)" : "var(--snow)"}
        onClick={handleOpenModal}
        title={hasNotes ? "Notes (has saved notes)" : "Notes"}
      >
        <NotesIcon width={16} height={16} fill="currentColor" />
        Notes
      </Button>

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

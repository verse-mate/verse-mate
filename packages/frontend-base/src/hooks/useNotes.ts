import { $env } from "frontend-envs";
import { useCallback, useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../analytics";
import { userSession } from "./userSession";

export interface Note {
  id: string;
  bookName: string;
  bookId: number;
  chapterNumber: number;
  verseNumber?: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// Backend note interface (from API)
interface BackendNote {
  note_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  chapter_number: number;
  book_id: number;
  book_name: string;
  verse_number?: number;
}

const NOTES_STORAGE_KEY = "versemate_notes";
const USE_BACKEND = true; // Toggle for backend integration

// Convert backend note to frontend format (module scope, stable reference)
const convertBackendNote = (backendNote: BackendNote): Note => ({
  id: backendNote.note_id,
  bookName: backendNote.book_name,
  bookId: backendNote.book_id,
  chapterNumber: backendNote.chapter_number,
  verseNumber: backendNote.verse_number,
  content: backendNote.content,
  createdAt: backendNote.created_at,
  updatedAt: backendNote.updated_at,
});

export const useNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { session } = userSession();
  const apiUrl = $env.get().apiUrl;

  // Helper to get full API path
  const getApiPath = useCallback(
    (path: string) => {
      return `${apiUrl}/bible${path}`;
    },
    [apiUrl],
  );

  // Load notes from localStorage or API
  useEffect(() => {
    const loadNotes = async () => {
      try {
        if (USE_BACKEND) {
          if (!session?.id) {
            setIsLoading(false);
            return;
          }
          const response = await fetch(getApiPath(`/book/notes/${session.id}`));
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data?.notes)) {
              const convertedNotes = (data.notes as BackendNote[]).map(
                convertBackendNote,
              );
              setNotes(convertedNotes);
              return;
            }
          }
          // Non-OK or invalid payload: fallback to localStorage
          const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
          if (storedNotes) {
            const parsedNotes = JSON.parse(storedNotes);
            setNotes(parsedNotes);
          }
        } else {
          // Load from localStorage (current implementation)
          const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
          if (storedNotes) {
            const parsedNotes = JSON.parse(storedNotes);
            setNotes(parsedNotes);
          }
        }
      } catch (error) {
        console.error("Failed to load notes:", error);
        // Fallback to localStorage if API fails
        if (USE_BACKEND) {
          const storedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
          if (storedNotes) {
            const parsedNotes = JSON.parse(storedNotes);
            setNotes(parsedNotes);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [session, getApiPath]);

  // Save notes to localStorage whenever notes change
  const saveNotesToStorage = useCallback((updatedNotes: Note[]) => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(updatedNotes));
    } catch (error) {
      console.error("Failed to save notes to localStorage:", error);
    }
  }, []);

  // Add a new note
  const addNote = useCallback(
    async (noteData: {
      bookName: string;
      bookId: number;
      chapterNumber: number;
      verseNumber?: number;
      content: string;
    }) => {
      try {
        if (USE_BACKEND) {
          if (!session?.id) {
            throw new Error("User not authenticated");
          }
          const response = await fetch(getApiPath("/book/note/add"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: session.id,
              book_id: noteData.bookId,
              chapter_number: noteData.chapterNumber,
              verse_id: noteData.verseNumber,
              content: noteData.content,
            }),
          });

          if (!response.ok) {
            throw new Error(`Error adding note: ${response.status}`);
          }

          const result = await response.json();

          if (result?.note) {
            const newNote = convertBackendNote({
              ...result.note,
              book_name: noteData.bookName,
              chapter_number: noteData.chapterNumber,
              book_id: noteData.bookId,
            });
            const updatedNotes = [newNote, ...notes];
            setNotes(updatedNotes);

            // Track NOTE_CREATED event
            analytics.track(AnalyticsEvent.NOTE_CREATED, {
              bookId: noteData.bookId,
              bookName: noteData.bookName,
              chapterNumber: noteData.chapterNumber,
              verseNumber: noteData.verseNumber || 0,
            });

            return newNote;
          }
        } else {
          // Local storage implementation (current)
          const newNote: Note = {
            id: crypto.randomUUID(),
            ...noteData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const updatedNotes = [newNote, ...notes];
          setNotes(updatedNotes);
          saveNotesToStorage(updatedNotes);

          // Track NOTE_CREATED event
          analytics.track(AnalyticsEvent.NOTE_CREATED, {
            bookId: noteData.bookId,
            bookName: noteData.bookName,
            chapterNumber: noteData.chapterNumber,
            verseNumber: noteData.verseNumber || 0,
          });

          return newNote;
        }
      } catch (error) {
        console.error("Failed to add note:", error);
        // Fallback to localStorage
        const newNote: Note = {
          id: crypto.randomUUID(),
          ...noteData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const updatedNotes = [newNote, ...notes];
        setNotes(updatedNotes);
        saveNotesToStorage(updatedNotes);

        // Track NOTE_CREATED event even on fallback
        analytics.track(AnalyticsEvent.NOTE_CREATED, {
          bookId: noteData.bookId,
          bookName: noteData.bookName,
          chapterNumber: noteData.chapterNumber,
          verseNumber: noteData.verseNumber || 0,
        });

        return newNote;
      }
    },
    [notes, saveNotesToStorage, session, getApiPath],
  );

  // Update an existing note
  const updateNote = useCallback(
    async (id: string, content: string) => {
      // Get the note being updated for analytics
      const noteToUpdate = notes.find((note) => note.id === id);

      try {
        if (USE_BACKEND) {
          const response = await fetch(getApiPath("/book/note/update"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              note_id: id,
              content,
            }),
          });

          if (response.ok) {
            // Update local state regardless of backend response format
            setNotes((currentNotes) => {
              const updatedNotes = currentNotes.map((note) =>
                note.id === id
                  ? { ...note, content, updatedAt: new Date().toISOString() }
                  : note,
              );
              return updatedNotes;
            });

            // Track NOTE_EDITED event
            if (noteToUpdate) {
              analytics.track(AnalyticsEvent.NOTE_EDITED, {
                bookId: noteToUpdate.bookId,
                bookName: noteToUpdate.bookName,
                chapterNumber: noteToUpdate.chapterNumber,
                verseNumber: noteToUpdate.verseNumber || 0,
              });
            }
            return;
          }

          // If backend call failed, still update local state
          throw new Error(`Backend update failed: ${response.status}`);
        }
        setNotes((currentNotes) => {
          const updatedNotes = currentNotes.map((note) =>
            note.id === id
              ? { ...note, content, updatedAt: new Date().toISOString() }
              : note,
          );
          saveNotesToStorage(updatedNotes);
          return updatedNotes;
        });

        // Track NOTE_EDITED event
        if (noteToUpdate) {
          analytics.track(AnalyticsEvent.NOTE_EDITED, {
            bookId: noteToUpdate.bookId,
            bookName: noteToUpdate.bookName,
            chapterNumber: noteToUpdate.chapterNumber,
            verseNumber: noteToUpdate.verseNumber || 0,
          });
        }
      } catch (error) {
        console.error("Failed to update note:", error);
        setNotes((currentNotes) => {
          const updatedNotes = currentNotes.map((note) =>
            note.id === id
              ? { ...note, content, updatedAt: new Date().toISOString() }
              : note,
          );
          saveNotesToStorage(updatedNotes);
          return updatedNotes;
        });

        // Track NOTE_EDITED event even on fallback
        if (noteToUpdate) {
          analytics.track(AnalyticsEvent.NOTE_EDITED, {
            bookId: noteToUpdate.bookId,
            bookName: noteToUpdate.bookName,
            chapterNumber: noteToUpdate.chapterNumber,
            verseNumber: noteToUpdate.verseNumber || 0,
          });
        }
      }
    },
    [notes, saveNotesToStorage, getApiPath],
  );

  // Delete a note
  const deleteNote = useCallback(
    async (id: string) => {
      // Get the note being deleted for analytics
      const noteToDelete = notes.find((note) => note.id === id);

      try {
        if (USE_BACKEND) {
          const response = await fetch(
            getApiPath(`/book/note/remove?note_id=${id}`),
            {
              method: "DELETE",
            },
          );

          if (response.ok) {
            const result = await response.json();
            if (result?.success) {
              const updatedNotes = notes.filter((note) => note.id !== id);
              setNotes(updatedNotes);

              // Track NOTE_DELETED event
              if (noteToDelete) {
                analytics.track(AnalyticsEvent.NOTE_DELETED, {
                  bookId: noteToDelete.bookId,
                  bookName: noteToDelete.bookName,
                  chapterNumber: noteToDelete.chapterNumber,
                  verseNumber: noteToDelete.verseNumber || 0,
                });
              }
              return;
            }
          }

          // If backend call failed, still update local state
          throw new Error(`Backend delete failed: ${response.status}`);
        }
        // Local storage implementation (current)
        const updatedNotes = notes.filter((note) => note.id !== id);
        setNotes(updatedNotes);
        saveNotesToStorage(updatedNotes);

        // Track NOTE_DELETED event
        if (noteToDelete) {
          analytics.track(AnalyticsEvent.NOTE_DELETED, {
            bookId: noteToDelete.bookId,
            bookName: noteToDelete.bookName,
            chapterNumber: noteToDelete.chapterNumber,
            verseNumber: noteToDelete.verseNumber || 0,
          });
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
        // Fallback to localStorage
        const updatedNotes = notes.filter((note) => note.id !== id);
        setNotes(updatedNotes);
        saveNotesToStorage(updatedNotes);

        // Track NOTE_DELETED event even on fallback
        if (noteToDelete) {
          analytics.track(AnalyticsEvent.NOTE_DELETED, {
            bookId: noteToDelete.bookId,
            bookName: noteToDelete.bookName,
            chapterNumber: noteToDelete.chapterNumber,
            verseNumber: noteToDelete.verseNumber || 0,
          });
        }
      }
    },
    [notes, saveNotesToStorage, getApiPath],
  );

  // Get notes for a specific book/chapter
  const getNotesForChapter = useCallback(
    (bookId: number, chapterNumber: number) => {
      return notes.filter(
        (note) =>
          note.bookId === bookId && note.chapterNumber === chapterNumber,
      );
    },
    [notes],
  );

  // Get notes for a specific verse
  const getNotesForVerse = useCallback(
    (bookId: number, chapterNumber: number, verseNumber: number) => {
      return notes.filter(
        (note) =>
          note.bookId === bookId &&
          note.chapterNumber === chapterNumber &&
          note.verseNumber === verseNumber,
      );
    },
    [notes],
  );

  return {
    notes,
    isLoading,
    addNote,
    updateNote,
    deleteNote,
    getNotesForChapter,
    getNotesForVerse,
  };
};

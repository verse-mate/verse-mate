import type { db } from "../shared/shared.plugin";

export interface Note {
  note_id: string;
  user_id: string;
  chapter_id: number;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNoteRequest {
  user_id: string;
  chapter_id: number;
  content: string;
}

export interface NoteWithChapterInfo extends Note {
  book_name: string;
  chapter_number: number;
}

export interface UpdateNoteRequest {
  content: string;
}

export class NotesService {
  private inMemoryNotes: Note[] = [];
  private useInMemory = false;

  constructor(private db: db) {
    console.log(
      "[NotesService] Initialized with real PostgreSQL database connection",
    );
    // Test database connection and fallback to in-memory if needed
    this.testDatabaseConnection();
  }

  private async testDatabaseConnection() {
    try {
      // Try a simple query to test the connection
      await this.db
        .getOrCreateConnection()
        .selectFrom("notes")
        .select("note_id")
        .limit(1)
        .execute();
      console.log("[NotesService] Database connection successful");
    } catch (error) {
      console.warn(
        "[NotesService] Database connection failed, using in-memory storage:",
        error,
      );
      this.useInMemory = true;
    }
  }

  async getNotesByChapter(
    userId: string,
    bookName: string,
    chapterNumber: number,
  ): Promise<NoteWithChapterInfo[]> {
    if (this.useInMemory) {
      console.log("[NotesService] Fetching notes from in-memory storage:", {
        userId,
        bookName,
        chapterNumber,
      });
      const notes = this.inMemoryNotes.filter(
        (note) =>
          note.user_id === userId &&
          note.chapter_id ===
            this.getChapterIdFromMemory(bookName, chapterNumber),
      );
      console.log(`[NotesService] Found ${notes.length} notes in memory`);
      return notes.map((note) => ({
        ...note,
        book_name: bookName,
        chapter_number: chapterNumber,
      }));
    }

    try {
      console.log(
        `[NotesService] Getting notes from database for ${bookName} ${chapterNumber}`,
      );

      // First, get the chapter_id from book name and chapter number
      const chapterResult = await this.db
        .getOrCreateConnection()
        .selectFrom("chapters")
        .innerJoin("books", "books.book_id", "chapters.book_id")
        .select("chapters.chapter_id")
        .where("books.name", "=", bookName)
        .where("chapters.chapter_number", "=", chapterNumber)
        .executeTakeFirst();

      if (!chapterResult) {
        console.log(
          `[NotesService] Chapter not found: ${bookName} ${chapterNumber}`,
        );
        return [];
      }

      // Then get notes for that chapter
      const notes = await this.db
        .getOrCreateConnection()
        .selectFrom("notes")
        .selectAll()
        .where("user_id", "=", userId)
        .where("chapter_id", "=", chapterResult.chapter_id)
        .orderBy("created_at", "desc")
        .execute();

      console.log(`[NotesService] Found ${notes.length} notes in database`);

      return notes.map((note) => ({
        ...note,
        book_name: bookName,
        chapter_number: chapterNumber,
      }));
    } catch (error) {
      console.error("[NotesService] Error fetching notes:", error);
      return [];
    }
  }

  private getChapterIdFromMemory(
    bookName: string,
    chapterNumber: number,
  ): number {
    // Simple hash for in-memory mode
    return bookName.length * 1000 + chapterNumber;
  }

  async createNote(noteData: CreateNoteRequest): Promise<Note> {
    if (this.useInMemory) {
      console.log("[NotesService] Creating note in memory:", noteData);
      const newNote: Note = {
        note_id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: noteData.user_id,
        chapter_id: noteData.chapter_id,
        content: noteData.content,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.inMemoryNotes.push(newNote);
      console.log("[NotesService] Created note in memory:", newNote.note_id);
      return newNote;
    }

    try {
      console.log("[NotesService] Creating note in database:", noteData);

      const createdNote = await this.db
        .getOrCreateConnection()
        .insertInto("notes")
        .values({
          user_id: noteData.user_id,
          chapter_id: noteData.chapter_id,
          content: noteData.content,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      console.log(
        "[NotesService] Created note in database:",
        createdNote.note_id,
      );
      return createdNote;
    } catch (error) {
      const err = error as Error;
      console.error("[NotesService] Error creating note:", err);
      throw new Error(`Failed to create note: ${err.message}`);
    }
  }

  async updateNote(
    noteId: string,
    userId: string,
    updateData: UpdateNoteRequest,
  ): Promise<Note | null> {
    try {
      console.log("[NotesService] Updating note in database:", {
        noteId,
        userId,
        updateData,
      });

      const updatedNote = await this.db
        .getOrCreateConnection()
        .updateTable("notes")
        .set({
          content: updateData.content,
          updated_at: new Date(),
        })
        .where("note_id", "=", noteId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();

      if (!updatedNote) {
        console.log("[NotesService] Note not found for update:", noteId);
        return null;
      }

      console.log(
        "[NotesService] Updated note in database:",
        updatedNote.note_id,
      );
      return updatedNote;
    } catch (error) {
      console.error("[NotesService] Error updating note:", error);
      return null;
    }
  }

  async deleteNote(noteId: string, userId: string): Promise<boolean> {
    try {
      console.log("[NotesService] Deleting note from database:", {
        noteId,
        userId,
      });

      const result = await this.db
        .getOrCreateConnection()
        .deleteFrom("notes")
        .where("note_id", "=", noteId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      const deleted = Number(result.numDeletedRows) > 0;
      console.log(
        "[NotesService] Deleted note from database:",
        noteId,
        "success:",
        deleted,
      );
      return deleted;
    } catch (error) {
      console.error("[NotesService] Error deleting note:", error);
      return false;
    }
  }

  async getChapterId(
    bookName: string,
    chapterNumber: number,
  ): Promise<number | null> {
    try {
      const result = await this.db
        .getOrCreateConnection()
        .selectFrom("chapters")
        .innerJoin("books", "books.book_id", "chapters.book_id")
        .select("chapters.chapter_id")
        .where("books.name", "=", bookName)
        .where("chapters.chapter_number", "=", chapterNumber)
        .executeTakeFirst();

      return result?.chapter_id || null;
    } catch (error) {
      console.error("[NotesService] Error getting chapter ID:", error);
      return null;
    }
  }
}

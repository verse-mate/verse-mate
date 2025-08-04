import { sql } from "kysely";
import type { db } from "../shared/shared.plugin";

export interface Note {
  note_id: string;
  user_id: string;
  book_name: string;
  chapter_number: number;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNoteRequest {
  user_id: string;
  book_name: string;
  chapter_number: number;
  content: string;
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
      await sql`SELECT 1`.execute(this.db.getOrCreateConnection());
      console.log("[NotesService] Database connection successful");

      // Test the notes table structure
      const tableInfo = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'notes' 
        ORDER BY ordinal_position
      `.execute(this.db.getOrCreateConnection());

      console.log("[NotesService] Notes table structure:", tableInfo.rows);
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
  ): Promise<Note[]> {
    if (this.useInMemory) {
      console.log("[NotesService] Fetching notes from in-memory storage:", {
        userId,
        bookName,
        chapterNumber,
      });
      const notes = this.inMemoryNotes.filter(
        (note) =>
          note.user_id === userId &&
          note.book_name === bookName &&
          note.chapter_number === chapterNumber,
      );
      console.log(`[NotesService] Found ${notes.length} notes in memory`);
      return notes;
    }

    try {
      console.log(
        `[NotesService] Getting notes from database for ${bookName} ${chapterNumber}`,
      );

      const result = await sql`
        SELECT * FROM notes 
        WHERE user_id = ${userId} 
          AND book_name = ${bookName} 
          AND chapter_number = ${chapterNumber} 
        ORDER BY created_at DESC
      `.execute(this.db.getOrCreateConnection());

      console.log(
        `[NotesService] Found ${result.rows.length} notes in database`,
      );
      return result.rows as Note[];
    } catch (error) {
      console.error("[NotesService] Error fetching notes:", error);
      return [];
    }
  }

  async createNote(noteData: CreateNoteRequest): Promise<Note> {
    if (this.useInMemory) {
      console.log("[NotesService] Creating note in memory:", noteData);
      const newNote: Note = {
        note_id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: noteData.user_id,
        book_name: noteData.book_name,
        chapter_number: noteData.chapter_number,
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
      console.log("[NotesService] Data types:", {
        user_id: typeof noteData.user_id,
        book_name: typeof noteData.book_name,
        chapter_number: typeof noteData.chapter_number,
        content: typeof noteData.content,
      });
      console.log("[NotesService] Data values:", {
        user_id: noteData.user_id,
        book_name: noteData.book_name,
        chapter_number: noteData.chapter_number,
        content: noteData.content,
      });

      const result = await sql`
        INSERT INTO notes (user_id, book_name, chapter_number, content, created_at, updated_at)
        VALUES (${noteData.user_id}, ${noteData.book_name}, ${noteData.chapter_number}, ${noteData.content}, NOW(), NOW())
        RETURNING *
      `.execute(this.db.getOrCreateConnection());

      const createdNote = result.rows[0] as Note;
      console.log(
        "[NotesService] Created note in database:",
        createdNote.note_id,
      );
      return createdNote;
    } catch (error) {
      const err = error as Error;
      console.error("[NotesService] Error creating note:", err);
      console.error("[NotesService] Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      console.error("[NotesService] Failed data:", noteData);
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

      const result = await sql`
        UPDATE notes 
        SET content = ${updateData.content}, updated_at = NOW()
        WHERE note_id = ${noteId} AND user_id = ${userId}
        RETURNING *
      `.execute(this.db.getOrCreateConnection());

      if (result.rows.length === 0) {
        console.log("[NotesService] Note not found for update:", noteId);
        return null;
      }

      const updatedNote = result.rows[0] as Note;
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

      const result = await sql`
        DELETE FROM notes 
        WHERE note_id = ${noteId} AND user_id = ${userId}
      `.execute(this.db.getOrCreateConnection());

      const deleted = (result.numAffectedRows || 0) > 0;
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
}

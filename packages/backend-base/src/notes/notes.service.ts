import { sql } from "kysely";
import type { db } from "../shared/shared.plugin";

export interface Note {
  note_id: string;
  user_id: string;
  book_name: string;
  chapter_number: number;
  translation: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNoteRequest {
  user_id: string;
  book_name: string;
  chapter_number: number;
  translation: string;
  content: string;
}

export interface UpdateNoteRequest {
  content: string;
}

export class NotesService {
  constructor(private db: db) {
    console.log(
      "[NotesService] Initialized with real PostgreSQL database connection",
    );
  }

  async getNotesByChapter(
    userId: string,
    bookName: string,
    chapterNumber: number,
    translation: string,
  ): Promise<Note[]> {
    try {
      console.log(
        `[NotesService] Getting notes from database for ${bookName} ${chapterNumber} (${translation})`,
      );

      const result = await sql`
        SELECT * FROM notes 
        WHERE user_id = ${userId} 
          AND book_name = ${bookName} 
          AND chapter_number = ${chapterNumber} 
          AND translation = ${translation} 
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
    try {
      console.log("[NotesService] Creating note in database:", noteData);

      const result = await sql`
        INSERT INTO notes (user_id, book_name, chapter_number, translation, content, created_at, updated_at)
        VALUES (${noteData.user_id}, ${noteData.book_name}, ${noteData.chapter_number}, ${noteData.translation}, ${noteData.content}, NOW(), NOW())
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

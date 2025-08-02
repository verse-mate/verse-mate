import { readFileSync } from "fs";
import { sql } from "kysely";
import { getOrCreateConnection } from "../backend-base/src/shared/database.js";

async function resetNotesTable() {
  try {
    console.log("Connecting to database...");
    const db = getOrCreateConnection();

    console.log("Dropping existing notes table...");
    await sql`DROP TABLE IF EXISTS notes CASCADE`.execute(db);

    console.log("Creating notes table with correct schema...");
    await sql`
      CREATE TABLE notes (
          note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          book_name VARCHAR(100) NOT NULL,
          chapter_number INTEGER NOT NULL,
          translation VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `.execute(db);

    console.log("Creating index...");
    await sql`
      CREATE INDEX notes_user_book_chapter_translation_idx 
      ON notes (user_id, book_name, chapter_number, translation)
    `.execute(db);

    console.log("✅ Notes table reset successfully with correct schema!");

    // Test the schema by describing the table
    const result = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'notes' 
      ORDER BY ordinal_position
    `.execute(db);

    console.log("📋 Table schema:");
    result.rows.forEach((row) => {
      console.log(
        `  ${row.column_name}: ${row.data_type} ${row.is_nullable === "NO" ? "(NOT NULL)" : "(NULLABLE)"}`,
      );
    });
  } catch (error) {
    console.error("❌ Error resetting notes table:", error);
    process.exit(1);
  }
}

resetNotesTable();

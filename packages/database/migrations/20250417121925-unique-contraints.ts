import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // chapters: one chapter_number per book
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_book_chapter ON chapters(book_id, chapter_number)`.compile(
      db,
    ),
  );

  // subtitles: one range per chapter
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_chap_range ON subtitles(chapter_id, start_verse, end_verse)`.compile(
      db,
    ),
  );

  // verses: one verse_number per chapter
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_verses_chap_verse ON verses(chapter_id, verse_number)`.compile(
      db,
    ),
  );

  // explanations: one explanation type per chapter
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_explanations_chap_type ON explanations(chapter_id, type)`.compile(
      db,
    ),
  );

  // explanation_ratings: one rating per user/explanation
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_user_explanation ON explanation_ratings(user_id, explanation_id)`.compile(
      db,
    ),
  );

  // favorites: prevent dupes per type
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_user_chapter ON favorites(user_id, chapter_id) WHERE type = 'chapter'`.compile(
      db,
    ),
  );
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_user_message ON favorites(user_id, message_id) WHERE type = 'message'`.compile(
      db,
    ),
  );

  // user_progress: one record per user/book/chapter
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_user_book_chap ON user_progress(user_id, book_id, chapter_id)`.compile(
      db,
    ),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_chapters_book_chapter`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_subtitles_chap_range`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_verses_chap_verse`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_explanations_chap_type`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_ratings_user_explanation`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_fav_user_chapter`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_fav_user_message`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_progress_user_book_chap`.compile(db),
  );
}

import type { DailyVerseHistory } from "database/src/models/public/DailyVerseHistory";
import type { DailyVerses } from "database/src/models/public/DailyVerses";
import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

export interface DailyVerseInput {
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end?: number | null;
  note?: string | null;
  is_active?: boolean;
  tag_ids: string[];
}

export interface DailyVerseListItem extends DailyVerses {
  tags: { id: string; slug: string; label: string }[];
}

/**
 * Data access for the Verse-of-the-Day feature. Pure persistence — all
 * selection logic, hashing, and fallback decisions live in the service.
 */
export class DailyVerseRepository {
  constructor(private readonly db: db) {}

  /** Active curated verses, id-ordered for deterministic selection. */
  async getActiveVerses(): Promise<DailyVerses[]> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("daily_verses")
      .where("is_active", "=", true)
      .selectAll()
      .orderBy("id", "asc")
      .execute();
  }

  /** Daily-verse ids served within the cooldown window [date - days, date). */
  async getRecentPickIds({
    date,
    days,
    userId = null,
  }: {
    date: string;
    days: number;
    userId?: string | null;
  }): Promise<string[]> {
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_history")
      .where("pick_date", ">=", sql<Date>`${date}::date - ${days}::int`)
      .where("pick_date", "<", sql<Date>`${date}::date`)
      .select("daily_verse_id");

    query =
      userId === null
        ? query.where("user_id", "is", null)
        : query.where("user_id", "=", userId);

    const rows = await query.execute();
    return rows.map((r) => r.daily_verse_id);
  }

  /** Existing pick for a date, if one was already recorded. */
  async findPickForDate({
    date,
    userId = null,
  }: {
    date: string;
    userId?: string | null;
  }): Promise<DailyVerseHistory | null> {
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_history")
      .where("pick_date", "=", sql<Date>`${date}::date`)
      .selectAll();

    query =
      userId === null
        ? query.where("user_id", "is", null)
        : query.where("user_id", "=", userId);

    const row = await query.executeTakeFirst();
    return row ?? null;
  }

  /**
   * Record the day's pick. Idempotent under the (pick_date, user_id)
   * NULLS NOT DISTINCT unique index: concurrent first-of-day requests both
   * insert the same deterministic pick, the loser hits ON CONFLICT DO NOTHING
   * and we re-read the winner's row. Returns the authoritative pick.
   */
  async recordPick({
    date,
    dailyVerseId,
    userId = null,
  }: {
    date: string;
    dailyVerseId: string;
    userId?: string | null;
  }): Promise<DailyVerseHistory> {
    const inserted = await this.db
      .getOrCreateConnection()
      .insertInto("daily_verse_history")
      .values({
        pick_date: date,
        daily_verse_id: dailyVerseId,
        user_id: userId,
      })
      .onConflict((oc) => oc.columns(["pick_date", "user_id"]).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) return inserted;

    // Lost the race — the winning row already exists; read it back.
    const existing = await this.findPickForDate({ date, userId });
    if (!existing) {
      // Extremely unlikely: conflict reported but no row found. Surface it.
      throw new Error("Failed to record or read daily verse pick");
    }
    return existing;
  }

  async getById(id: string): Promise<DailyVerses | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("daily_verses")
      .where("id", "=", id)
      .selectAll()
      .executeTakeFirst();
    return row ?? null;
  }

  /** Tags (slug + label) attached to a curated verse. */
  async getTagsForVerse(
    dailyVerseId: string,
  ): Promise<{ id: string; slug: string; label: string }[]> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_to_tag as dvt")
      .innerJoin("daily_verse_tags as t", "t.id", "dvt.tag_id")
      .where("dvt.daily_verse_id", "=", dailyVerseId)
      .select(["t.id", "t.slug", "t.label"])
      .orderBy("t.slug", "asc")
      .execute();
  }

  /**
   * Resolve (book_id, chapter_number) to a chapter_id. book_id is the
   * `books.book_id` surrogate space the reader uses.
   */
  async getChapterId({
    bookId,
    chapterNumber,
  }: {
    bookId: number;
    chapterNumber: number;
  }): Promise<number | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .where("chapter_number", "=", chapterNumber)
      .select("chapter_id")
      .executeTakeFirst();
    return row?.chapter_id ?? null;
  }

  /** Verse rows for a chapter+version within an inclusive verse range. */
  async getVersesInRange({
    chapterId,
    versionId,
    verseStart,
    verseEnd,
  }: {
    chapterId: number;
    versionId: string;
    verseStart: number;
    verseEnd: number;
  }): Promise<{ verseNumber: number; text: string }[]> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("verses")
      .where("chapter_id", "=", chapterId)
      .where("version_id", "=", versionId)
      .where("verse_number", ">=", verseStart)
      .where("verse_number", "<=", verseEnd)
      .select(["verses.verse_number as verseNumber", "verses.text"])
      .orderBy("verseNumber", "asc")
      .execute();
  }

  async getVersionByKey(versionKey: string) {
    return this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .where("version_key", "=", versionKey)
      .select(["id", "version_key", "language_code"])
      .executeTakeFirst();
  }

  async getLocalizedBookName({
    versionId,
    bookId,
  }: {
    versionId: string;
    bookId: number;
  }): Promise<string | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("version_book_names")
      .where("version_id", "=", versionId)
      .where("book_id", "=", bookId)
      .select("name")
      .executeTakeFirst();
    return row?.name ?? null;
  }

  async getCanonicalBookName(bookId: number): Promise<string | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .where("book_id", "=", bookId)
      .select("name")
      .executeTakeFirst();
    return row?.name ?? null;
  }

  /* ----------------------------- Admin CRUD ----------------------------- */

  async list({
    tagSlug,
    activeOnly,
    limit,
    offset,
  }: {
    tagSlug?: string;
    activeOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: DailyVerseListItem[]; total: number }> {
    const conn = this.db.getOrCreateConnection();

    let base = conn.selectFrom("daily_verses");
    if (activeOnly) base = base.where("is_active", "=", true);
    if (tagSlug) {
      base = base.where("id", "in", (sub) =>
        sub
          .selectFrom("daily_verse_to_tag as dvt")
          .innerJoin("daily_verse_tags as t", "t.id", "dvt.tag_id")
          .whereRef("dvt.daily_verse_id", "=", "daily_verses.id")
          .where("t.slug", "=", tagSlug)
          .select("dvt.daily_verse_id"),
      );
    }

    const rows = await base
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const totalRow = await base
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    const items: DailyVerseListItem[] = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        tags: await this.getTagsForVerse(row.id),
      })),
    );

    return { items, total: Number(totalRow?.count ?? 0) };
  }

  /** Insert a curated verse + its tag links in one transaction. */
  async create(input: DailyVerseInput): Promise<DailyVerses> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const verse = await trx
          .insertInto("daily_verses")
          .values({
            book_id: input.book_id,
            chapter_number: input.chapter_number,
            verse_start: input.verse_start,
            verse_end: input.verse_end ?? null,
            note: input.note ?? null,
            is_active: input.is_active ?? true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        if (input.tag_ids.length > 0) {
          await trx
            .insertInto("daily_verse_to_tag")
            .values(
              input.tag_ids.map((tagId) => ({
                daily_verse_id: verse.id,
                tag_id: tagId,
              })),
            )
            .execute();
        }

        return verse;
      });
  }

  /** Update fields and (if provided) replace the tag set. */
  async update(
    id: string,
    input: Partial<DailyVerseInput>,
  ): Promise<DailyVerses | null> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const updated = await trx
          .updateTable("daily_verses")
          .set({
            ...(input.book_id !== undefined ? { book_id: input.book_id } : {}),
            ...(input.chapter_number !== undefined
              ? { chapter_number: input.chapter_number }
              : {}),
            ...(input.verse_start !== undefined
              ? { verse_start: input.verse_start }
              : {}),
            ...(input.verse_end !== undefined
              ? { verse_end: input.verse_end }
              : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
            ...(input.is_active !== undefined
              ? { is_active: input.is_active }
              : {}),
            updated_at: new Date(),
          })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirst();

        if (!updated) return null;

        if (input.tag_ids) {
          await trx
            .deleteFrom("daily_verse_to_tag")
            .where("daily_verse_id", "=", id)
            .execute();
          if (input.tag_ids.length > 0) {
            await trx
              .insertInto("daily_verse_to_tag")
              .values(
                input.tag_ids.map((tagId) => ({
                  daily_verse_id: id,
                  tag_id: tagId,
                })),
              )
              .execute();
          }
        }

        return updated;
      });
  }

  /** Soft delete — set is_active = false. */
  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .getOrCreateConnection()
      .updateTable("daily_verses")
      .set({ is_active: false, updated_at: new Date() })
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async listHistory({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }) {
    return this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_history as h")
      .innerJoin("daily_verses as dv", "dv.id", "h.daily_verse_id")
      .select([
        "h.id",
        "h.pick_date",
        "h.daily_verse_id",
        "h.user_id",
        "dv.book_id",
        "dv.chapter_number",
        "dv.verse_start",
        "dv.verse_end",
      ])
      .orderBy("h.pick_date", "desc")
      .limit(limit)
      .offset(offset)
      .execute();
  }

  /* ------------------------------- Tags -------------------------------- */

  async listTags(activeOnly = false) {
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_tags")
      .selectAll();
    if (activeOnly) query = query.where("is_active", "=", true);
    return query.orderBy("slug", "asc").execute();
  }

  async getTagIdsBySlugs(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_tags")
      .where("slug", "in", slugs)
      .select(["id", "slug"])
      .execute();
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  async tagIdsExist(tagIds: string[]): Promise<boolean> {
    if (tagIds.length === 0) return true;
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("daily_verse_tags")
      .where("id", "in", tagIds)
      .select("id")
      .execute();
    return rows.length === tagIds.length;
  }

  async createTag({
    slug,
    label,
    isActive = true,
  }: {
    slug: string;
    label: string;
    isActive?: boolean;
  }) {
    return this.db
      .getOrCreateConnection()
      .insertInto("daily_verse_tags")
      .values({ slug, label, is_active: isActive })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

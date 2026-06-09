import type { DailyVerses } from "database/src/models/public/DailyVerses";
import { ValidationError } from "../../common/errors";
import cacheConstants from "../../shared/cache.constants";
import type { cache, db } from "../../shared/shared.plugin";
import {
  type DailyVerseInput,
  DailyVerseRepository,
} from "../repository/daily-verse.repository";

const DEFAULT_VERSION_KEY = "NASB1995";

/**
 * How many days back a verse is excluded from re-selection. If the active
 * pool is smaller than this window the cooldown is dropped automatically
 * (see pickForDate) so the endpoint never deadlocks (D-28).
 */
const COOLDOWN_DAYS = 60;

/** Selection cache TTL — one day. */
const PICK_CACHE_TTL = "24h";

export interface RenderedVerse {
  verseNumber: number;
  text: string;
}

export interface VerseOfTheDayResult {
  empty: false;
  reference: {
    bookId: number;
    chapterNumber: number;
    verseStart: number;
    verseEnd: number | null;
  };
  referenceText: string;
  verses: RenderedVerse[];
  tags: string[];
  versionKey: string;
  languageCode: string;
  date: string;
  /** Observability flags emitted by the plugin as PostHog events (D-40). */
  metrics: {
    poolTooSmall: boolean;
    missingBookNameLocalization: boolean;
  };
}

export interface EmptyVerseOfTheDayResult {
  empty: true;
  date: string;
  fallbackMessage: string;
}

const EMPTY_FALLBACK_MESSAGE = "Open VerseMate to see today's verse";

/**
 * Deterministic 32-bit hash of a string (FNV-1a). Used to pick a stable
 * verse for a given date without Math.random — same date always hashes to
 * the same candidate index.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same-family English check (en, en-US, …). */
function isEnglish(languageCode: string | null | undefined): boolean {
  const code = (languageCode ?? "").trim().toLowerCase();
  return !code || code === "en" || code.startsWith("en-");
}

/** Server-local date as YYYY-MM-DD. */
export function todayServerLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class DailyVerseService {
  private readonly repo: DailyVerseRepository;

  /**
   * `cache` is optional so unit tests can run without Redis. When present,
   * the selected daily_verse_id is memoized per (date, user) for 24h and
   * invalidated on admin writes (D-7, D-26, D-39).
   */
  constructor(
    private readonly db: db,
    repo?: DailyVerseRepository,
    private readonly cache?: cache,
  ) {
    this.repo = repo ?? new DailyVerseRepository(db);
  }

  /**
   * Best-effort cache invalidation of today's pick (D-39 post-commit hook).
   *
   * PD-5: this only DELs the global (user_id NULL) key. With per-user picks
   * (PD-7) there can be one cache entry per user, which we deliberately do not
   * fan-out a DEL across — a user who already has today's verse keeps it, while
   * not-yet-served users and anonymous callers reflect a curator's edit on
   * their next request. Per-user entries self-heal at the 24h TTL.
   */
  async invalidatePickForToday(): Promise<void> {
    if (!this.cache) return;
    const today = todayServerLocal();
    try {
      await this.cache.delete(cacheConstants.dailyVersePick(today, null));
    } catch (err) {
      // Non-atomic by design: a failed DEL self-heals at the 24h TTL.
      console.warn("[daily-verse] cache invalidation failed:", err);
    }
  }

  /**
   * Pick (or read) the curated verse for a date, personalized to `userId` when
   * present (PD-1 / PD-7). An authenticated user gets their own deterministic,
   * non-repeating sequence — the per-user cooldown excludes their recent picks
   * and the selection seed includes their id, so two users see different verses
   * the same day. `userId === null` is the shared global pick (anonymous), the
   * "this is God's message for me" personalization being the whole point.
   *
   * Returns null when the active pool is empty. `poolTooSmall` is true when
   * the cooldown filter had to be relaxed because every active verse was
   * recently served.
   */
  async pickForDate(
    date: string,
    userId: string | null,
  ): Promise<{ verse: DailyVerses; poolTooSmall: boolean } | null> {
    const cacheKey = cacheConstants.dailyVersePick(date, userId);

    // Fast path: cached selection id → load + return.
    if (this.cache) {
      try {
        const cached = await this.cache.get<{ id: string }>(cacheKey);
        if (cached?.id) {
          const verse = await this.repo.getById(cached.id);
          if (verse?.is_active) return { verse, poolTooSmall: false };
        }
      } catch {
        // Cache read failures fall through to the durable path.
      }
    }

    // Durable source of truth: if today was already picked, return it. This
    // also makes the endpoint idempotent across the day independent of cache.
    const existing = await this.repo.findPickForDate({ date, userId });
    if (existing) {
      const verse = await this.repo.getById(existing.daily_verse_id);
      if (verse) {
        await this.cachePick(cacheKey, verse.id);
        return { verse, poolTooSmall: false };
      }
      // Picked verse vanished (hard-deleted) — fall through to re-pick.
    }

    const active = await this.repo.getActiveVerses();
    if (active.length === 0) return null;

    const recent = new Set(
      await this.repo.getRecentPickIds({ date, days: COOLDOWN_DAYS, userId }),
    );
    let candidates = active.filter((v) => !recent.has(v.id));
    let poolTooSmall = false;
    if (candidates.length === 0) {
      // Cooldown excluded everything — relax rather than deadlock (D-28).
      candidates = active;
      poolTooSmall = true;
    }

    // Personalize the choice: seed with the user so two users get different
    // verses the same day, while staying deterministic per (user, date) for
    // idempotency + caching (PD-1). Anonymous keeps the global date-only seed.
    const seed = userId ? `${date}:${userId}` : date;
    const index = hashString(seed) % candidates.length;
    const chosen = candidates[index];

    // Idempotent record; on concurrent race the winner's row is returned.
    const recorded = await this.repo.recordPick({
      date,
      dailyVerseId: chosen.id,
      userId,
    });

    if (recorded.daily_verse_id === chosen.id) {
      await this.cachePick(cacheKey, chosen.id);
      return { verse: chosen, poolTooSmall };
    }
    // Lost the race to a different pick — honor the recorded winner.
    const winner = await this.repo.getById(recorded.daily_verse_id);
    if (winner) await this.cachePick(cacheKey, winner.id);
    return winner ? { verse: winner, poolTooSmall: false } : null;
  }

  private async cachePick(key: string, id: string): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.set(key, { id }, PICK_CACHE_TTL);
    } catch {
      // Caching is best-effort; a miss just re-reads history next time.
    }
  }

  /**
   * Full verse-of-the-day payload for the requested version. Resolves verse
   * text in the user's version with per-verse NASB1995 fallback (D-29 keeps
   * the pool to NASB-renderable verses, so this fallback is a safety net),
   * and builds a localized reference string with English book-name fallback
   * (D-30).
   */
  async getVerseOfTheDay({
    date,
    versionKey,
    userId,
  }: {
    date: string;
    versionKey: string;
    userId: string | null;
  }): Promise<VerseOfTheDayResult | EmptyVerseOfTheDayResult> {
    const picked = await this.pickForDate(date, userId);
    if (!picked) {
      return { empty: true, date, fallbackMessage: EMPTY_FALLBACK_MESSAGE };
    }

    const { verse, poolTooSmall } = picked;
    const verseEnd = verse.verse_end ?? verse.verse_start;

    // Resolve requested version; fall back to NASB1995 if unknown.
    const requested = await this.repo.getVersionByKey(versionKey);
    const baseline =
      requested?.version_key === DEFAULT_VERSION_KEY
        ? requested
        : await this.repo.getVersionByKey(DEFAULT_VERSION_KEY);

    const resolvedVersion = requested ?? baseline;
    if (!resolvedVersion) {
      // No NASB1995 either — misconfigured DB. Treat as empty rather than 500.
      return { empty: true, date, fallbackMessage: EMPTY_FALLBACK_MESSAGE };
    }

    const chapterId = await this.repo.getChapterId({
      bookId: verse.book_id,
      chapterNumber: verse.chapter_number,
    });
    if (chapterId === null) {
      return { empty: true, date, fallbackMessage: EMPTY_FALLBACK_MESSAGE };
    }

    const verses = await this.resolveVerses({
      chapterId,
      versionId: resolvedVersion.id,
      baselineVersionId: baseline?.id ?? resolvedVersion.id,
      verseStart: verse.verse_start,
      verseEnd,
    });

    const { referenceText, missingBookNameLocalization } =
      await this.buildReferenceText({
        bookId: verse.book_id,
        chapterNumber: verse.chapter_number,
        verseStart: verse.verse_start,
        verseEnd,
        versionId: resolvedVersion.id,
        languageCode: resolvedVersion.language_code,
      });

    const tags = (await this.repo.getTagsForVerse(verse.id)).map((t) => t.slug);

    return {
      empty: false,
      reference: {
        bookId: verse.book_id,
        chapterNumber: verse.chapter_number,
        verseStart: verse.verse_start,
        verseEnd: verse.verse_end,
      },
      referenceText,
      verses,
      tags,
      versionKey: resolvedVersion.version_key,
      languageCode: resolvedVersion.language_code,
      date,
      metrics: { poolTooSmall, missingBookNameLocalization },
    };
  }

  /** Fetch the range in the target version; fill gaps from NASB1995. */
  private async resolveVerses({
    chapterId,
    versionId,
    baselineVersionId,
    verseStart,
    verseEnd,
  }: {
    chapterId: number;
    versionId: string;
    baselineVersionId: string;
    verseStart: number;
    verseEnd: number;
  }): Promise<RenderedVerse[]> {
    const primary = await this.repo.getVersesInRange({
      chapterId,
      versionId,
      verseStart,
      verseEnd,
    });
    const byNumber = new Map(primary.map((v) => [v.verseNumber, v]));

    const missing: number[] = [];
    for (let n = verseStart; n <= verseEnd; n++) {
      if (!byNumber.has(n)) missing.push(n);
    }

    if (missing.length > 0 && baselineVersionId !== versionId) {
      const fallback = await this.repo.getVersesInRange({
        chapterId,
        versionId: baselineVersionId,
        verseStart,
        verseEnd,
      });
      for (const v of fallback) {
        if (!byNumber.has(v.verseNumber)) byNumber.set(v.verseNumber, v);
      }
    }

    return [...byNumber.values()].sort((a, b) => a.verseNumber - b.verseNumber);
  }

  /** Localized "Book C:V[-V]" with English book-name fallback (D-30). */
  private async buildReferenceText({
    bookId,
    chapterNumber,
    verseStart,
    verseEnd,
    versionId,
    languageCode,
  }: {
    bookId: number;
    chapterNumber: number;
    verseStart: number;
    verseEnd: number;
    versionId: string;
    languageCode: string;
  }): Promise<{ referenceText: string; missingBookNameLocalization: boolean }> {
    let bookName = await this.repo.getLocalizedBookName({ versionId, bookId });
    let missingBookNameLocalization = false;

    if (!bookName) {
      // No per-version localized name. Falling back to canonical English is
      // only "missing" worth flagging when the user expected a non-English
      // name (D-30).
      if (!isEnglish(languageCode)) missingBookNameLocalization = true;
      bookName = (await this.repo.getCanonicalBookName(bookId)) ?? `${bookId}`;
    }

    const range =
      verseEnd > verseStart ? `${verseStart}-${verseEnd}` : `${verseStart}`;

    return {
      referenceText: `${bookName} ${chapterNumber}:${range}`,
      missingBookNameLocalization,
    };
  }

  /* --------------------------- Admin operations --------------------------- */

  /**
   * Validate + create a curated verse. Enforces (D-29) every verse exists in
   * the NASB1995 baseline, (D-33) the range is within one chapter, and that
   * all tag ids are known.
   */
  async createCurated(input: DailyVerseInput): Promise<DailyVerses> {
    await this.validateCurated(input);
    return this.repo.create(input);
  }

  async updateCurated(
    id: string,
    input: Partial<DailyVerseInput>,
  ): Promise<DailyVerses | null> {
    const existing = await this.repo.getById(id);
    if (!existing) return null;

    // Validate against the merged shape so partial updates can't break rules.
    await this.validateCurated({
      book_id: input.book_id ?? existing.book_id,
      chapter_number: input.chapter_number ?? existing.chapter_number,
      verse_start: input.verse_start ?? existing.verse_start,
      verse_end:
        input.verse_end !== undefined ? input.verse_end : existing.verse_end,
      tag_ids: input.tag_ids ?? [],
      note: input.note,
    });

    return this.repo.update(id, input);
  }

  async deleteCurated(id: string): Promise<boolean> {
    return this.repo.softDelete(id);
  }

  /* --------------------------- Admin read passthroughs -------------------- */

  list(opts: {
    tagSlug?: string;
    activeOnly?: boolean;
    limit: number;
    offset: number;
  }) {
    return this.repo.list(opts);
  }

  listHistory(opts: { limit: number; offset: number }) {
    return this.repo.listHistory(opts);
  }

  listTags(activeOnly = false) {
    return this.repo.listTags(activeOnly);
  }

  createTag(input: { slug: string; label: string; is_active?: boolean }) {
    return this.repo.createTag({
      slug: input.slug,
      label: input.label,
      isActive: input.is_active,
    });
  }

  private async validateCurated(input: DailyVerseInput): Promise<void> {
    const verseEnd = input.verse_end ?? input.verse_start;
    if (verseEnd < input.verse_start) {
      throw new ValidationError("verse_end must be >= verse_start");
    }

    // Tag ids must all be known (D-27 controlled vocabulary).
    if (input.tag_ids.length > 0) {
      const ok = await this.repo.tagIdsExist(input.tag_ids);
      if (!ok) throw new ValidationError("One or more tag ids are unknown");
    }

    // Chapter must exist (also implicitly enforces same-chapter range — D-33).
    const chapterId = await this.repo.getChapterId({
      bookId: input.book_id,
      chapterNumber: input.chapter_number,
    });
    if (chapterId === null) {
      throw new ValidationError(
        `No chapter ${input.chapter_number} for book ${input.book_id}`,
      );
    }

    // Every verse must render in the NASB1995 baseline (D-29).
    const baseline = await this.repo.getVersionByKey(DEFAULT_VERSION_KEY);
    if (!baseline) {
      throw new ValidationError(
        `Baseline version ${DEFAULT_VERSION_KEY} not found`,
      );
    }
    const baselineVerses = await this.repo.getVersesInRange({
      chapterId,
      versionId: baseline.id,
      verseStart: input.verse_start,
      verseEnd,
    });
    const present = new Set(baselineVerses.map((v) => v.verseNumber));
    for (let n = input.verse_start; n <= verseEnd; n++) {
      if (!present.has(n)) {
        throw new ValidationError(
          `Verse ${n} does not exist in ${DEFAULT_VERSION_KEY} baseline`,
        );
      }
    }
  }
}

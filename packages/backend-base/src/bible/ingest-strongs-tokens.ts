import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
/**
 * Strong's-tokens seed loader.
 *
 * Reads one or more `<version_key>_tokens.jsonl` files (the output format of
 * the offline ingest pipeline — see scripts/strongs-ingest/) and writes each
 * verse's `tokens` JSONB column on the `verses` table. Pre-existing rows are
 * looked up by (version_key → version_id, book_id+chapter → chapter_id,
 * verse_number) — verses missing from the DB are reported but never inserted,
 * because the canonical verse text + (chapter_id, verse_number, version_id)
 * uniqueness must already be in place via the multi-version ingest loader.
 *
 * Wire format (one JSON object per line):
 *
 *   {"version_key": "RVR09", "book_id": 59, "chapter": 1, "verse_number": 1,
 *    "tokens": [{"text": "JACOBO", "strongs": "G2385"}, {"text": ", siervo de "},
 *               {"text": "Dios", "strongs": "G2316"}, ...]}
 *
 * Hard invariant the loader checks before writing: joining each token's
 * `text` field byte-for-byte must equal the verse's current `text` column.
 * Rows that fail this check are skipped and logged — the API contract
 * requires lossless join, so writing a tokens array that doesn't reproduce
 * the served verse text would corrupt the wire shape when `?tagged=1` is
 * requested. Drift is non-fatal: those rows just stay untagged.
 *
 * Idempotent: re-running overwrites the tokens array in place.
 *
 * Usage (from the deployed image):
 *   bun ./dist/ingest-strongs-tokens.js --input <dir>
 *
 * The <dir> must contain `<version_key_lowercase>_tokens.jsonl` files, one
 * per version (e.g. `rvr09_tokens.jsonl`, `sch51_tokens.jsonl`). Files for
 * version keys that aren't registered in `bible_versions` are skipped with
 * a warning.
 */
import { createInterface } from "node:readline";
import { db } from "database";
import type { VerseToken } from "database/src/models/public/Verses";

interface SeedRow {
  version_key: string;
  book_id: number;
  chapter: number;
  verse_number: number;
  tokens: VerseToken[];
}

interface LoadStats {
  version_key: string;
  rows_read: number;
  rows_written: number;
  rows_skipped_drift: number;
  rows_skipped_missing_verse: number;
  rows_skipped_invalid: number;
}

function joinTokens(tokens: VerseToken[]): string {
  let out = "";
  for (const t of tokens) out += t.text;
  return out;
}

/**
 * Streams a JSONL file line-by-line so the loader works on 30k-verse Bibles
 * without holding everything in memory. Tokens-only seeds are typically
 * 25-30 MB per language; streaming keeps peak RSS bounded.
 */
async function* streamJsonl<T>(file: string): AsyncIterable<T> {
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as T;
  }
}

async function getVersionId(versionKey: string): Promise<string | null> {
  const row = await db
    .getOrCreateConnection()
    .selectFrom("bible_versions")
    .where("version_key", "=", versionKey)
    .select("id")
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Build a (book_id, chapter_number) → chapter_id map up front. With ~1,189
 * chapters in the Protestant canon this stays well under a millisecond per
 * lookup vs. one query per row.
 */
async function loadChapterIndex(): Promise<Map<string, number>> {
  const rows = await db
    .getOrCreateConnection()
    .selectFrom("chapters")
    .select(["chapter_id", "book_id", "chapter_number"])
    .execute();
  const idx = new Map<string, number>();
  for (const r of rows)
    idx.set(`${r.book_id}:${r.chapter_number}`, r.chapter_id);
  return idx;
}

async function loadOneVersion(file: string): Promise<LoadStats> {
  const stats: LoadStats = {
    version_key: "",
    rows_read: 0,
    rows_written: 0,
    rows_skipped_drift: 0,
    rows_skipped_missing_verse: 0,
    rows_skipped_invalid: 0,
  };

  let versionId: string | null = null;
  const chapterIndex = await loadChapterIndex();
  const conn = db.getOrCreateConnection();

  for await (const row of streamJsonl<SeedRow>(file)) {
    stats.rows_read += 1;
    if (!stats.version_key) stats.version_key = row.version_key;

    if (
      typeof row.version_key !== "string" ||
      !Array.isArray(row.tokens) ||
      typeof row.book_id !== "number" ||
      typeof row.chapter !== "number" ||
      typeof row.verse_number !== "number"
    ) {
      stats.rows_skipped_invalid += 1;
      continue;
    }

    // Resolve version_id once per file. The seed file is single-version by
    // construction; if we hit a row from a different version key, log and skip.
    if (versionId == null) {
      versionId = await getVersionId(row.version_key);
      if (!versionId) {
        console.warn(
          `version_key '${row.version_key}' not found in bible_versions; aborting ${path.basename(file)}`,
        );
        return stats;
      }
    } else if (row.version_key !== stats.version_key) {
      stats.rows_skipped_invalid += 1;
      continue;
    }

    const chapterId = chapterIndex.get(`${row.book_id}:${row.chapter}`);
    if (chapterId == null) {
      stats.rows_skipped_missing_verse += 1;
      continue;
    }

    // Lossless-join gate: confirm the joined tokens reproduce the served
    // text byte-for-byte before writing. Drifted rows stay untagged.
    const existing = await conn
      .selectFrom("verses")
      .where("chapter_id", "=", chapterId)
      .where("verse_number", "=", row.verse_number)
      .where("version_id", "=", versionId)
      .select(["verse_id", "text"])
      .executeTakeFirst();

    if (!existing) {
      stats.rows_skipped_missing_verse += 1;
      continue;
    }

    if (joinTokens(row.tokens) !== existing.text) {
      stats.rows_skipped_drift += 1;
      continue;
    }

    await conn
      .updateTable("verses")
      .set({ tokens: row.tokens })
      .where("verse_id", "=", existing.verse_id)
      .execute();
    stats.rows_written += 1;

    if (stats.rows_read % 5000 === 0) {
      console.log(
        `  [${stats.version_key}] ${stats.rows_read.toLocaleString()} rows scanned, ${stats.rows_written.toLocaleString()} written`,
      );
    }
  }

  return stats;
}

export async function main(inputDir: string, onlyKey?: string): Promise<void> {
  const entries = await readdir(inputDir);
  const seedFiles = entries
    .filter((e) => e.endsWith("_tokens.jsonl"))
    .map((e) => path.join(inputDir, e))
    .sort();

  if (seedFiles.length === 0) {
    console.error(
      `No *_tokens.jsonl files in ${inputDir}. Expected files like rvr09_tokens.jsonl, sch51_tokens.jsonl, ...`,
    );
    return;
  }

  const wantKey = onlyKey?.toLowerCase();
  const results: LoadStats[] = [];

  for (const file of seedFiles) {
    const base = path.basename(file, "_tokens.jsonl");
    if (wantKey && base.toLowerCase() !== wantKey) continue;
    console.log(`Loading ${path.basename(file)} ...`);
    const stats = await loadOneVersion(file);
    results.push(stats);
    console.log(
      `  done: ${stats.rows_written.toLocaleString()} written, ${stats.rows_skipped_drift.toLocaleString()} skipped (drift), ${stats.rows_skipped_missing_verse.toLocaleString()} skipped (missing), ${stats.rows_skipped_invalid.toLocaleString()} skipped (invalid)`,
    );
  }

  console.log("\nSummary:");
  for (const s of results) {
    const coverage =
      s.rows_read > 0
        ? ` (${((s.rows_written / s.rows_read) * 100).toFixed(1)}%)`
        : "";
    console.log(
      `  ${s.version_key.padEnd(8)} ${s.rows_written.toLocaleString().padStart(7)} of ${s.rows_read.toLocaleString().padStart(7)} verses tagged${coverage}`,
    );
  }
}

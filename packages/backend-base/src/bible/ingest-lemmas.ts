/**
 * Lemma + lemma-translations seed loader.
 *
 * Same schema convention as topics + topic_translations: English content
 * lives on the `lemmas` row directly; `lemma_translations` is ONLY for
 * non-English languages.
 *
 * Reads two JSONL files:
 *
 *   lemmas.jsonl                — one row per Strong's. Universal fields
 *                                 + English baseline (pos, basic_gloss,
 *                                 semantic_range, notes, related).
 *
 *   lemma_translations.jsonl    — one row per (strongs, language_code) for
 *                                 NON-English languages. Rows with
 *                                 language_code='en' are rejected — those
 *                                 belong on lemmas.
 *
 * Both upsert (idempotent). lemma_translations rows whose strongs isn't in
 * lemmas are skipped + counted because the FK would fail.
 *
 * Wire format (lemmas.jsonl):
 *
 *   {"strongs":"G2385","lemma":"Ἰάκωβος","translit":"Iakōbos",
 *    "pronunciation":null,"nt_frequency":42,"ot_frequency":0,"loaded":true,
 *    "pos":"Proper noun (person)","basic_gloss":"James",
 *    "semantic_range":["..."],"notes":"...","related":[{"translit":"...","note":"..."}]}
 *
 * Wire format (lemma_translations.jsonl):
 *
 *   {"strongs":"G2385","language_code":"es","translated_pos":"...",
 *    "translated_basic_gloss":"Santiago","translated_semantic_range":[...],
 *    "translated_notes":"...","translated_related":[...],"source":"llm:..."}
 *
 * Usage (from the deployed image):
 *   bun ./dist/ingest-lemmas.js --input <dir>
 */
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { db } from "database";
import type { NewLemmaTranslations } from "database/src/models/public/LemmaTranslations";
import type { NewLemmas, RelatedWord } from "database/src/models/public/Lemmas";
import { sql } from "kysely";

interface LemmaSeedRow {
  strongs: string;
  lemma: string;
  translit?: string | null;
  pronunciation?: string | null;
  nt_frequency?: number | null;
  ot_frequency?: number | null;
  loaded?: boolean;
  // English baseline (optional — non-loaded lemmas have null content)
  pos?: string | null;
  basic_gloss?: string | null;
  semantic_range?: string[] | null;
  notes?: string | null;
  related?: RelatedWord[] | null;
}

interface TranslationSeedRow {
  strongs: string;
  language_code: string;
  translated_pos?: string | null;
  translated_basic_gloss?: string | null;
  translated_semantic_range?: string[] | null;
  translated_notes?: string | null;
  translated_related?: RelatedWord[] | null;
  source?: string | null;
}

interface LoadStats {
  rows_read: number;
  rows_written: number;
  rows_skipped_invalid: number;
  rows_skipped_orphan: number; // for translations whose strongs isn't in lemmas
  rows_skipped_english: number; // English in translations file → belongs on lemmas
}

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

async function loadLemmas(file: string): Promise<LoadStats> {
  const stats: LoadStats = {
    rows_read: 0,
    rows_written: 0,
    rows_skipped_invalid: 0,
    rows_skipped_orphan: 0,
    rows_skipped_english: 0,
  };
  const conn = db.getOrCreateConnection();
  const batch: NewLemmas[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await conn
      .insertInto("lemmas")
      .values(batch)
      .onConflict((oc) =>
        oc.column("strongs").doUpdateSet({
          lemma: (eb) => eb.ref("excluded.lemma"),
          translit: (eb) => eb.ref("excluded.translit"),
          pronunciation: (eb) => eb.ref("excluded.pronunciation"),
          nt_frequency: (eb) => eb.ref("excluded.nt_frequency"),
          ot_frequency: (eb) => eb.ref("excluded.ot_frequency"),
          loaded: (eb) => eb.ref("excluded.loaded"),
          pos: (eb) => eb.ref("excluded.pos"),
          basic_gloss: (eb) => eb.ref("excluded.basic_gloss"),
          semantic_range: (eb) => eb.ref("excluded.semantic_range"),
          notes: (eb) => eb.ref("excluded.notes"),
          related: (eb) => eb.ref("excluded.related"),
          updated_at: sql`now()`,
        }),
      )
      .execute();
    stats.rows_written += batch.length;
    batch.length = 0;
  };
  for await (const row of streamJsonl<LemmaSeedRow>(file)) {
    stats.rows_read += 1;
    if (typeof row.strongs !== "string" || typeof row.lemma !== "string") {
      stats.rows_skipped_invalid += 1;
      continue;
    }
    batch.push({
      strongs: row.strongs,
      lemma: row.lemma,
      translit: row.translit ?? null,
      pronunciation: row.pronunciation ?? null,
      nt_frequency: row.nt_frequency ?? null,
      ot_frequency: row.ot_frequency ?? null,
      loaded: row.loaded === true,
      pos: row.pos ?? null,
      basic_gloss: row.basic_gloss ?? null,
      semantic_range: row.semantic_range ?? null,
      notes: row.notes ?? null,
      related: row.related ?? null,
    });
    if (batch.length >= 500) await flush();
    if (stats.rows_read % 5000 === 0) {
      console.log(
        `  [lemmas] ${stats.rows_read.toLocaleString()} rows scanned, ` +
          `${stats.rows_written.toLocaleString()} written`,
      );
    }
  }
  await flush();
  return stats;
}

async function loadLemmaTranslations(file: string): Promise<LoadStats> {
  const stats: LoadStats = {
    rows_read: 0,
    rows_written: 0,
    rows_skipped_invalid: 0,
    rows_skipped_orphan: 0,
    rows_skipped_english: 0,
  };
  const conn = db.getOrCreateConnection();
  // Build a set of valid strongs once so we can skip orphan rows in O(1).
  const validStrongs = new Set<string>(
    (await conn.selectFrom("lemmas").select("strongs").execute()).map(
      (r) => r.strongs,
    ),
  );
  console.log(
    `  [translations] ${validStrongs.size} lemmas in DB to anchor against`,
  );

  const batch: NewLemmaTranslations[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await conn
      .insertInto("lemma_translations")
      .values(batch)
      .onConflict((oc) =>
        oc.columns(["strongs", "language_code"]).doUpdateSet({
          translated_pos: (eb) => eb.ref("excluded.translated_pos"),
          translated_basic_gloss: (eb) =>
            eb.ref("excluded.translated_basic_gloss"),
          translated_semantic_range: (eb) =>
            eb.ref("excluded.translated_semantic_range"),
          translated_notes: (eb) => eb.ref("excluded.translated_notes"),
          translated_related: (eb) => eb.ref("excluded.translated_related"),
          source: (eb) => eb.ref("excluded.source"),
          updated_at: sql`now()`,
        }),
      )
      .execute();
    stats.rows_written += batch.length;
    batch.length = 0;
  };
  for await (const row of streamJsonl<TranslationSeedRow>(file)) {
    stats.rows_read += 1;
    if (
      typeof row.strongs !== "string" ||
      typeof row.language_code !== "string"
    ) {
      stats.rows_skipped_invalid += 1;
      continue;
    }
    if (row.language_code === "en") {
      // English baseline belongs on the `lemmas` row directly (same as
      // topics.name/description). Reject rather than silently misplace.
      stats.rows_skipped_english += 1;
      continue;
    }
    if (!validStrongs.has(row.strongs)) {
      stats.rows_skipped_orphan += 1;
      continue;
    }
    batch.push({
      strongs: row.strongs,
      language_code: row.language_code,
      translated_pos: row.translated_pos ?? null,
      translated_basic_gloss: row.translated_basic_gloss ?? null,
      translated_semantic_range: row.translated_semantic_range ?? null,
      translated_notes: row.translated_notes ?? null,
      translated_related: row.translated_related ?? null,
      source: row.source ?? null,
    });
    if (batch.length >= 500) await flush();
    if (stats.rows_read % 5000 === 0) {
      console.log(
        `  [translations] ${stats.rows_read.toLocaleString()} rows scanned, ` +
          `${stats.rows_written.toLocaleString()} written, ` +
          `${stats.rows_skipped_orphan.toLocaleString()} orphan-skipped`,
      );
    }
  }
  await flush();
  return stats;
}

export async function main(inputDir: string): Promise<void> {
  const entries = await readdir(inputDir);

  // Always load lemmas first — translations depend on them via FK.
  const lemmasFile = entries.includes("lemmas.jsonl")
    ? path.join(inputDir, "lemmas.jsonl")
    : null;
  const translationsFile = entries.includes("lemma_translations.jsonl")
    ? path.join(inputDir, "lemma_translations.jsonl")
    : null;

  if (!lemmasFile && !translationsFile) {
    console.error(`No lemmas.jsonl or lemma_translations.jsonl in ${inputDir}`);
    return;
  }

  if (lemmasFile) {
    console.log(`Loading ${path.basename(lemmasFile)} ...`);
    const stats = await loadLemmas(lemmasFile);
    console.log(
      `  done: ${stats.rows_written.toLocaleString()} written, ` +
        `${stats.rows_skipped_invalid.toLocaleString()} skipped (invalid)`,
    );
  }

  if (translationsFile) {
    console.log(`Loading ${path.basename(translationsFile)} ...`);
    const stats = await loadLemmaTranslations(translationsFile);
    console.log(
      `  done: ${stats.rows_written.toLocaleString()} written, ` +
        `${stats.rows_skipped_invalid.toLocaleString()} skipped (invalid), ` +
        `${stats.rows_skipped_orphan.toLocaleString()} skipped (orphan strongs), ` +
        `${stats.rows_skipped_english.toLocaleString()} skipped (English — belongs on lemmas)`,
    );
  }
}

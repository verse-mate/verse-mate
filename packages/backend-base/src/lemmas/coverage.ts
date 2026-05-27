/**
 * Lemma translation-coverage report.
 *
 * For each language, counts how many of the `loaded` lemmas (the curated
 * tap-worthy set the `/lemma` endpoint serves a translated card for) are:
 *
 *   - complete : a translation row exists and covers every English prose
 *                field — this is exactly what makes `is_translated: true`.
 *   - partial  : a translation row exists but at least one prose field
 *                still falls back to English.
 *   - missing  : no translation row for that lemma + language.
 *
 * Surfaces the coverage gap described in the lexicon handoff so a backfill
 * can be prioritized. Read-only — runs against whatever DB the `database`
 * package is pointed at.
 *
 * Usage (bundled into the deployed image, same as ingest-lemmas):
 *   bun ./dist/lemma-coverage.js                 # all known languages
 *   bun ./dist/lemma-coverage.js --lang es,de    # a subset
 *   bun ./dist/lemma-coverage.js --json          # machine-readable
 */
import { db } from "database";
import { isLemmaFullyTranslated } from "./lemma-language";

/** The languages the LLM pipeline targets (scripts/lemma-translate). */
export const SUPPORTED_LEMMA_LANGUAGES = [
  "es",
  "de",
  "fr",
  "ru",
  "it",
  "pt",
  "ro",
  "hi",
  "tl",
  "uk",
] as const;

export interface LanguageCoverage {
  language_code: string;
  /** loaded lemmas (the denominator — same for every language). */
  total_loaded: number;
  complete: number;
  partial: number;
  missing: number;
  /** translation rows whose strongs is not in the loaded set. */
  extra_unloaded: number;
  /** complete / total_loaded, rounded to 1 decimal. */
  complete_pct: number;
}

export async function computeCoverage(
  langsFilter?: string[],
): Promise<{ totalLoaded: number; rows: LanguageCoverage[] }> {
  const conn = db.getOrCreateConnection();

  const loaded = await conn
    .selectFrom("lemmas")
    .where("loaded", "=", true)
    .select([
      "strongs",
      "pos",
      "basic_gloss",
      "semantic_range",
      "notes",
      "related",
    ])
    .execute();
  const loadedStrongs = new Set(loaded.map((l) => l.strongs));
  const totalLoaded = loaded.length;

  // Languages to report: the explicit filter, else the supported set plus
  // any other codes actually present (e.g. a stray region-suffixed "pt-BR"
  // that wouldn't match a normalized "pt" request — worth surfacing).
  const present = (
    await conn
      .selectFrom("lemma_translations")
      .where("is_active", "=", true)
      .select("language_code")
      .distinct()
      .execute()
  ).map((r) => r.language_code);
  const langs = (
    langsFilter?.length
      ? langsFilter
      : [...new Set([...SUPPORTED_LEMMA_LANGUAGES, ...present])]
  ).sort();

  const translations = await conn
    .selectFrom("lemma_translations")
    .where("is_active", "=", true)
    .where("language_code", "in", langs)
    .select([
      "strongs",
      "language_code",
      "translated_pos",
      "translated_basic_gloss",
      "translated_semantic_range",
      "translated_notes",
      "translated_related",
    ])
    .execute();

  const baseByStrongs = new Map(loaded.map((l) => [l.strongs, l]));
  const rows: LanguageCoverage[] = langs.map((language_code) => ({
    language_code,
    total_loaded: totalLoaded,
    complete: 0,
    partial: 0,
    missing: 0,
    extra_unloaded: 0,
    complete_pct: 0,
  }));
  const byLang = new Map(rows.map((r) => [r.language_code, r]));
  const seen = new Map<string, Set<string>>();

  for (const t of translations) {
    const row = byLang.get(t.language_code);
    if (!row) continue;
    if (!loadedStrongs.has(t.strongs)) {
      row.extra_unloaded += 1;
      continue;
    }
    let seenForLang = seen.get(t.language_code);
    if (!seenForLang) {
      seenForLang = new Set();
      seen.set(t.language_code, seenForLang);
    }
    seenForLang.add(t.strongs);

    const baseRow = baseByStrongs.get(t.strongs);
    if (!baseRow) continue;
    const complete = isLemmaFullyTranslated(
      {
        pos: baseRow.pos,
        basic_gloss: baseRow.basic_gloss,
        semantic_range: baseRow.semantic_range,
        notes: baseRow.notes,
        related: baseRow.related,
      },
      {
        pos: t.translated_pos,
        basic_gloss: t.translated_basic_gloss,
        semantic_range: t.translated_semantic_range,
        notes: t.translated_notes,
        related: t.translated_related,
      },
    );
    if (complete) row.complete += 1;
    else row.partial += 1;
  }

  for (const row of rows) {
    const covered = (seen.get(row.language_code) ?? new Set()).size;
    row.missing = totalLoaded - covered;
    row.complete_pct =
      totalLoaded === 0
        ? 0
        : Math.round((row.complete / totalLoaded) * 1000) / 10;
  }

  return { totalLoaded, rows };
}

export async function reportCoverage(opts: {
  langs?: string[];
  json?: boolean;
}): Promise<void> {
  const { totalLoaded, rows } = await computeCoverage(opts.langs);

  if (opts.json) {
    console.log(JSON.stringify({ total_loaded: totalLoaded, rows }, null, 2));
    return;
  }

  console.log(`Loaded lemmas (translatable universe): ${totalLoaded}\n`);
  const header = [
    "lang".padEnd(6),
    "complete".padStart(9),
    "partial".padStart(8),
    "missing".padStart(8),
    "extra".padStart(6),
    "complete%".padStart(10),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log(
      [
        r.language_code.padEnd(6),
        String(r.complete).padStart(9),
        String(r.partial).padStart(8),
        String(r.missing).padStart(8),
        String(r.extra_unloaded).padStart(6),
        `${r.complete_pct}%`.padStart(10),
      ].join("  "),
    );
  }
}

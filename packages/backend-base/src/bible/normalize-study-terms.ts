/**
 * Backfill: re-apply the deterministic study term dictionary
 * (study_term_translations) over EXISTING study_translations rows, fixing any
 * label-like field (pills/contrast-type/columns/title book name) the AI batch
 * left in English. Idempotent — only rewrites rows where a replacement happens.
 *
 * Run from packages/backend-base with POSTGRES_URL set:
 *   bun src/bible/normalize-study-terms.ts                # all translations
 *   bun src/bible/normalize-study-terms.ts --lang uk      # one language
 *   bun src/bible/normalize-study-terms.ts --book James   # one book
 *   bun src/bible/normalize-study-terms.ts --dry-run      # report only
 */
import { db } from "database";
import { sql } from "kysely";
import {
  type StudyTermDict,
  type StudyTermRow,
  applyStudyTermDictionary,
  buildStudyTermDictMap,
} from "./services/study-term-dictionary";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (f: string) => {
    const i = a.indexOf(f);
    return i !== -1 && a[i + 1] ? a[i + 1] : undefined;
  };
  return {
    lang: get("--lang"),
    book: get("--book"),
    dryRun: a.includes("--dry-run"),
  };
}

async function main() {
  const { lang, book, dryRun } = parseArgs();
  const conn = db.getOrCreateConnection();

  const termRows = (await conn
    .selectFrom("study_term_translations")
    .select(["language_code", "term_type", "source_en", "target_term"])
    .where("is_active", "=", true)
    .execute()) as StudyTermRow[];
  if (termRows.length === 0) {
    console.log("No active study_term_translations rows — nothing to apply.");
    await db.closeConnection();
    return;
  }

  let q = conn
    .selectFrom("study_translations as t")
    .innerJoin("studies as s", "s.study_id", "t.study_id")
    .select([
      "t.translation_id",
      "t.language_code",
      "t.translated_content",
      "s.chapter",
      sql<string>`s.content->>'bookName'`.as("book_name"),
    ])
    .where("t.is_active", "=", true);
  if (lang) q = q.where("t.language_code", "=", lang);
  if (book) q = q.where(sql`s.content->>'bookName'`, "=", book);
  const rows = await q.execute();

  const dictCache = new Map<string, StudyTermDict>();
  const dictFor = (l: string): StudyTermDict => {
    let d = dictCache.get(l);
    if (!d) {
      d = buildStudyTermDictMap(termRows, l);
      dictCache.set(l, d);
    }
    return d;
  };

  let touched = 0;
  let totalReplaced = 0;
  for (const r of rows) {
    const { content, replaced } = applyStudyTermDictionary(
      r.translated_content,
      dictFor(r.language_code),
    );
    if (replaced > 0) {
      touched++;
      totalReplaced += replaced;
      console.log(
        `  ${r.language_code} ${r.book_name} ${r.chapter}: ${replaced} term(s)${dryRun ? " (dry-run)" : ""}`,
      );
      if (!dryRun) {
        await conn
          .updateTable("study_translations")
          .set({
            translated_content: content as object,
            updated_at: new Date(),
          })
          .where("translation_id", "=", r.translation_id)
          .execute();
      }
    }
  }

  console.log(
    `\n${dryRun ? "[dry-run] " : ""}Done — ${totalReplaced} replacement(s) across ${touched}/${rows.length} translation rows.`,
  );
  await db.closeConnection();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.closeConnection();
  process.exit(1);
});

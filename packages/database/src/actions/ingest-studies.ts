/**
 * One-time(ish) ingest of English inductive-study content from the
 * `@versemate/studies` package into the `studies` table.
 *
 * Studies historically shipped as 1,189 bundled TS modules consumed by web
 * and mobile via `getStudyFor()`. This script reads those modules and
 * upserts each chapter's full InductiveStudy object into `studies` as the
 * en-US baseline (see migration 20260531000000). Translations are produced
 * separately by the study-translate batch and land in `study_translations`.
 *
 * Idempotent: keyed on (book_id, chapter); re-running updates content and
 * `content_hash` only when the source changed.
 *
 * Source resolution (first match wins):
 *   1. --src <dir> CLI arg
 *   2. STUDIES_SRC_DIR env
 *   3. sibling checkout ../verse-mate-studies/src (default dev layout)
 *
 * Chapter filter for testing (process ONE chapter end-to-end):
 *   bun src/actions/ingest-studies.ts --chapter 59:1     # James 1
 *   bun src/actions/ingest-studies.ts --book 59          # all of James
 *   bun src/actions/ingest-studies.ts                    # everything
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../database";

interface InductiveStudyLike {
  bookId: number;
  chapter: number;
  steps: unknown[];
  [key: string]: unknown;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
  };
  let onlyBook: number | undefined;
  let onlyChapter: number | undefined;
  const chapterArg = get("--chapter"); // "bookId:chapter"
  if (chapterArg) {
    const [b, c] = chapterArg.split(":").map((n) => Number.parseInt(n, 10));
    onlyBook = b;
    onlyChapter = c;
  }
  const bookArg = get("--book");
  if (bookArg) onlyBook = Number.parseInt(bookArg, 10);
  return { src: get("--src"), onlyBook, onlyChapter };
}

function resolveStudiesSrc(cliSrc?: string): string {
  if (cliSrc) return resolve(cliSrc);
  if (process.env.STUDIES_SRC_DIR) return resolve(process.env.STUDIES_SRC_DIR);
  // Default dev layout: verse-mate and verse-mate-studies are siblings.
  // This file: packages/database/src/actions → repo root is ../../../..
  const repoRoot = resolve(import.meta.dir, "../../../..");
  return resolve(repoRoot, "../verse-mate-studies/src");
}

/** Pull the InductiveStudy export out of a chapter module by shape. */
function extractStudy(mod: Record<string, unknown>): InductiveStudyLike | null {
  for (const value of Object.values(mod)) {
    if (
      value &&
      typeof value === "object" &&
      Array.isArray((value as InductiveStudyLike).steps) &&
      typeof (value as InductiveStudyLike).bookId === "number" &&
      typeof (value as InductiveStudyLike).chapter === "number"
    ) {
      return value as InductiveStudyLike;
    }
  }
  return null;
}

function hashStudy(study: InductiveStudyLike): string {
  return createHash("sha256").update(JSON.stringify(study)).digest("hex");
}

async function main() {
  const { src, onlyBook, onlyChapter } = parseArgs();
  const srcDir = resolveStudiesSrc(src);
  console.log(`[ingest-studies] reading from: ${srcDir}`);
  if (onlyBook) {
    console.log(
      `[ingest-studies] FILTER: book=${onlyBook}${
        onlyChapter ? ` chapter=${onlyChapter}` : " (all chapters)"
      }`,
    );
  }

  const files = readdirSync(srcDir).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts",
  );
  console.log(`[ingest-studies] ${files.length} candidate modules`);

  const conn = db.getOrCreateConnection();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    let study: InductiveStudyLike | null = null;
    try {
      const mod = (await import(resolve(srcDir, file))) as Record<
        string,
        unknown
      >;
      study = extractStudy(mod);
    } catch (e) {
      console.warn(`[ingest-studies] import failed for ${file}: ${String(e)}`);
      failed++;
      continue;
    }
    if (!study) {
      console.warn(`[ingest-studies] no study export found in ${file}`);
      failed++;
      continue;
    }

    if (onlyBook && study.bookId !== onlyBook) continue;
    if (onlyChapter && study.chapter !== onlyChapter) continue;

    const contentHash = hashStudy(study);

    // Does a row already exist, and is it unchanged?
    const existing = await conn
      .selectFrom("studies")
      .select(["study_id", "content_hash"])
      .where("book_id", "=", study.bookId)
      .where("chapter", "=", study.chapter)
      .executeTakeFirst();

    if (existing && existing.content_hash === contentHash) {
      skipped++;
      continue;
    }

    await conn
      .insertInto("studies")
      .values({
        book_id: study.bookId,
        chapter: study.chapter,
        // node-postgres serializes JS objects to JSON for jsonb params.
        content: study as unknown as object,
        content_hash: contentHash,
      })
      .onConflict((oc) =>
        oc.columns(["book_id", "chapter"]).doUpdateSet({
          content: study as unknown as object,
          content_hash: contentHash,
          updated_at: new Date(),
        }),
      )
      .execute();

    if (existing) {
      updated++;
    } else {
      inserted++;
    }
    if ((inserted + updated) % 100 === 0) {
      console.log(
        `[ingest-studies] progress: ${inserted} inserted, ${updated} updated…`,
      );
    }
  }

  console.log(
    `[ingest-studies] done — inserted=${inserted} updated=${updated} unchanged=${skipped} failed=${failed}`,
  );
  await db.closeConnection();
}

main().catch((e) => {
  console.error("[ingest-studies] fatal:", e);
  process.exit(1);
});

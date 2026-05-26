/**
 * Multi-version Bible ingest loader.
 *
 * Reads the per-version JSON produced by verse-mate-web's
 * `scripts/bible-ingest/build.py --all` and upserts it into the versioned
 * storage (bible_versions, version_book_names, chapters, verses, subtitles).
 *
 * Expected layout of the input directory:
 *
 *   <input>/
 *     index.json                       (optional — versions + attribution lines)
 *     <KEY>/
 *       manifest.json                  ({ key, language, license, attribution, ... })
 *       <bookId>/<chapter>.json        ({ book, bookId, chapter, verses:[{number,text}], subtitles? })
 *
 * Usage:
 *   bun packages/backend-base/src/bible/ingest-versions.ts --input <dir> [--version KEY]
 *
 * The loader is idempotent: re-running updates existing verse text rather than
 * duplicating rows. books/chapters are shared across versions; only verse text,
 * subtitles, and the localized book name are version-scoped.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { db } from "database";
import type { BibleVersionsUpdate } from "database/src/models/public/BibleVersions";

interface ChapterFile {
  book: string;
  bookId: number;
  chapter: number;
  verses: { number: number; text: string }[];
  subtitles?: { subtitle: string; start_verse: number; end_verse: number }[];
}

interface Manifest {
  key: string;
  // Accept a few likely field names — build.py output may vary slightly.
  language?: string;
  language_code?: string;
  title?: string;
  version_name?: string;
  name?: string;
  license?: string;
  license_url?: string;
  attribution?: string;
  testament_coverage?: "full" | "nt" | "ot";
}

const NT_START_BOOK_ID = 40; // Matthew

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function upsertVersion(manifest: Manifest): Promise<string> {
  const conn = db.getOrCreateConnection();
  const language_code = manifest.language_code ?? manifest.language;
  const version_name =
    manifest.version_name ?? manifest.title ?? manifest.name ?? manifest.key;

  const existing = await conn
    .selectFrom("bible_versions")
    .where("version_key", "=", manifest.key)
    .select(["id"])
    .executeTakeFirst();

  if (existing) {
    // Only overwrite fields the manifest actually provides; leave curated
    // metadata (seeded by migration) intact otherwise.
    const update: BibleVersionsUpdate = {};
    if (version_name) update.version_name = version_name;
    if (language_code) update.language_code = language_code;
    if (manifest.license) update.license = manifest.license;
    if (manifest.license_url) update.license_url = manifest.license_url;
    if (manifest.attribution) update.attribution = manifest.attribution;
    if (manifest.testament_coverage)
      update.testament_coverage = manifest.testament_coverage;

    if (Object.keys(update).length > 0) {
      await conn
        .updateTable("bible_versions")
        .set(update)
        .where("id", "=", existing.id)
        .execute();
    }
    return existing.id;
  }

  if (!language_code) {
    throw new Error(
      `manifest for ${manifest.key} is missing a language/language_code and the version is not pre-seeded`,
    );
  }

  const inserted = await conn
    .insertInto("bible_versions")
    .values({
      version_key: manifest.key,
      version_name,
      language_code,
      license: manifest.license ?? null,
      license_url: manifest.license_url ?? null,
      attribution: manifest.attribution ?? null,
      testament_coverage: manifest.testament_coverage ?? "full",
      is_active: true,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return inserted.id;
}

async function getOrCreateChapterId(
  bookId: number,
  chapterNumber: number,
): Promise<number | null> {
  const conn = db.getOrCreateConnection();

  const book = await conn
    .selectFrom("books")
    .where("book_id", "=", bookId)
    .select("book_id")
    .executeTakeFirst();
  if (!book) {
    console.warn(`  ! book_id ${bookId} not found in books table — skipping`);
    return null;
  }

  const existing = await conn
    .selectFrom("chapters")
    .where("book_id", "=", bookId)
    .where("chapter_number", "=", chapterNumber)
    .select("chapter_id")
    .executeTakeFirst();
  if (existing) return existing.chapter_id;

  const created = await conn
    .insertInto("chapters")
    .values({ book_id: bookId, chapter_number: chapterNumber })
    .returning("chapter_id")
    .executeTakeFirstOrThrow();
  return created.chapter_id;
}

async function upsertChapterFile(
  versionId: string,
  file: ChapterFile,
): Promise<number> {
  const conn = db.getOrCreateConnection();
  const chapterId = await getOrCreateChapterId(file.bookId, file.chapter);
  if (chapterId == null) return 0;

  // Localized book name (USFM \h) for this version.
  if (file.book) {
    await conn
      .insertInto("version_book_names")
      .values({ version_id: versionId, book_id: file.bookId, name: file.book })
      .onConflict((oc) =>
        oc.columns(["version_id", "book_id"]).doUpdateSet({ name: file.book }),
      )
      .execute();
  }

  // Subtitles: replace this version's section headings for the chapter.
  await conn
    .deleteFrom("subtitles")
    .where("chapter_id", "=", chapterId)
    .where("version_id", "=", versionId)
    .execute();
  if (file.subtitles?.length) {
    await conn
      .insertInto("subtitles")
      .values(
        file.subtitles.map((s) => ({
          chapter_id: chapterId,
          version_id: versionId,
          subtitle: s.subtitle,
          start_verse: s.start_verse,
          end_verse: s.end_verse,
        })),
      )
      .execute();
  }

  // Verses: update text in place where present, insert when missing. Avoids
  // deleting rows that notes/highlights may reference via chapter_id.
  const existingVerses = await conn
    .selectFrom("verses")
    .where("chapter_id", "=", chapterId)
    .where("version_id", "=", versionId)
    .select(["verse_id", "verse_number"])
    .execute();
  const byNumber = new Map(
    existingVerses.map((v) => [v.verse_number, v.verse_id]),
  );

  for (const verse of file.verses) {
    const verseId = byNumber.get(verse.number);
    if (verseId != null) {
      await conn
        .updateTable("verses")
        .set({ text: verse.text })
        .where("verse_id", "=", verseId)
        .execute();
    } else {
      await conn
        .insertInto("verses")
        .values({
          chapter_id: chapterId,
          verse_number: verse.number,
          text: verse.text,
          version_id: versionId,
        })
        .execute();
    }
  }

  return file.verses.length;
}

async function ingestVersionDir(versionDir: string): Promise<void> {
  const manifestPath = path.join(versionDir, "manifest.json");
  let manifest: Manifest;
  try {
    manifest = await readJson<Manifest>(manifestPath);
  } catch {
    console.warn(`Skipping ${versionDir}: no readable manifest.json`);
    return;
  }
  if (!manifest.key) {
    console.warn(`Skipping ${versionDir}: manifest has no "key"`);
    return;
  }

  console.log(`\n=== ${manifest.key} (${versionDir}) ===`);
  const versionId = await upsertVersion(manifest);

  const entries = await readdir(versionDir, { withFileTypes: true });
  const bookDirs = entries
    .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
    .map((e) => Number.parseInt(e.name, 10))
    .sort((a, b) => a - b);

  let totalVerses = 0;
  const bookIdsSeen: number[] = [];

  for (const bookId of bookDirs) {
    const bookDir = path.join(versionDir, String(bookId));
    const chapterFiles = (await readdir(bookDir)).filter((f) =>
      f.endsWith(".json"),
    );
    bookIdsSeen.push(bookId);

    for (const fileName of chapterFiles) {
      const file = await readJson<ChapterFile>(path.join(bookDir, fileName));
      totalVerses += await upsertChapterFile(versionId, file);
    }
    console.log(`  book ${bookId}: ${chapterFiles.length} chapters`);
  }

  // If the data is NT-only and the manifest didn't say so, record it.
  if (
    !manifest.testament_coverage &&
    bookIdsSeen.length > 0 &&
    bookIdsSeen.every((id) => id >= NT_START_BOOK_ID)
  ) {
    await db
      .getOrCreateConnection()
      .updateTable("bible_versions")
      .set({ testament_coverage: "nt" })
      .where("id", "=", versionId)
      .execute();
    console.log("  detected NT-only coverage");
  }

  console.log(
    `  done: ${bookIdsSeen.length} books, ${totalVerses} verses upserted`,
  );
}

export async function main(inputDir: string, onlyKey?: string): Promise<void> {
  if (!(await isDir(inputDir))) {
    throw new Error(
      `Input directory not found: ${inputDir}\nGenerate it first with verse-mate-web: cd scripts/bible-ingest && python3 build.py --all`,
    );
  }

  const entries = await readdir(inputDir, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !onlyKey || name === onlyKey)
    .sort();

  if (versionDirs.length === 0) {
    throw new Error(
      onlyKey
        ? `No version directory named "${onlyKey}" under ${inputDir}`
        : `No version directories found under ${inputDir}`,
    );
  }

  for (const name of versionDirs) {
    await ingestVersionDir(path.join(inputDir, name));
  }

  console.log("\nIngest complete.");
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      input: { type: "string", default: "scripts/bible-ingest/output" },
      version: { type: "string" },
    },
    allowPositionals: true,
  });

  main(path.resolve(values.input as string), values.version)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

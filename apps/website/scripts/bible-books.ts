import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const API_ORIGIN = "https://api.versemate.org";
export const READER_ORIGIN = "https://app.versemate.org";
export const READER_SITEMAP = `${READER_ORIGIN}/sitemaps/bible-en-US.xml`;
export const GENERATED_FILE = join(
  import.meta.dir,
  "../src/lib/bible-books.generated.json",
);
const BOOK_COUNT = 66;
const MOST_CHAPTERS = 150;
const BOOK_NAME = /^[1-3]? ?[A-Z][A-Za-z ]*$/;
const SLUG = /^[a-z0-9-]+$/;

export type GeneratedBook = {
  id: number;
  name: string;
  slug: string;
  testament: "OT" | "NT";
  chapters: number;
  paragraph: string;
};

type Fetch = (url: string) => Promise<Response>;

type TestamentsAnswer = {
  testaments: { b: number; n: string; t: string; c: number }[];
};

type IntroductionAnswer = { introduction?: { biblical_role?: string | null } };

export class BookDataError extends Error {}

export const slugOf = (name: string) => name.toLowerCase().replace(/ /g, "-");

export const chapterUrls = (book: Pick<GeneratedBook, "slug" | "chapters">) =>
  Array.from(
    { length: book.chapters },
    (_, index) => `${READER_ORIGIN}/bible/${book.slug}/${index + 1}`,
  );

const readJson = async <T>(fetcher: Fetch, url: string): Promise<T> => {
  const response = await fetcher(url);
  if (!response.ok)
    throw new BookDataError(`${url} answered HTTP ${response.status}`);
  return (await response.json()) as T;
};

export async function sitemapUrls(fetcher: Fetch) {
  const response = await fetcher(READER_SITEMAP);
  if (!response.ok)
    throw new BookDataError(
      `${READER_SITEMAP} answered HTTP ${response.status}`,
    );
  return new Set(
    [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    ),
  );
}

export async function generateBooks(fetcher: Fetch): Promise<GeneratedBook[]> {
  const { testaments } = await readJson<TestamentsAnswer>(
    fetcher,
    `${API_ORIGIN}/bible/testaments?bible_version=NASB1995`,
  );
  if (testaments.length !== BOOK_COUNT)
    throw new BookDataError(
      `the API lists ${testaments.length} books, not ${BOOK_COUNT}`,
    );

  const listed = await sitemapUrls(fetcher);
  const books: GeneratedBook[] = [];
  for (const entry of [...testaments].sort((a, b) => a.b - b.b)) {
    if (typeof entry.n !== "string" || !BOOK_NAME.test(entry.n))
      throw new BookDataError(
        `unexpected book name ${JSON.stringify(entry.n)}`,
      );
    if (entry.t !== "OT" && entry.t !== "NT")
      throw new BookDataError(`${entry.n}: unknown testament "${entry.t}"`);
    if (
      !Number.isInteger(entry.b) ||
      !Number.isInteger(entry.c) ||
      entry.c < 1 ||
      entry.c > MOST_CHAPTERS
    )
      throw new BookDataError(
        `${entry.n}: unexpected id ${JSON.stringify(entry.b)} or chapter count ${JSON.stringify(entry.c)}`,
      );
    if (!SLUG.test(slugOf(entry.n)))
      throw new BookDataError(`${entry.n}: unexpected slug "${slugOf(entry.n)}"`);
    const { introduction } = await readJson<IntroductionAnswer>(
      fetcher,
      `${API_ORIGIN}/bible/book/${entry.b}/introduction`,
    );
    const paragraph = introduction?.biblical_role?.trim() ?? "";
    if (!paragraph)
      throw new BookDataError(`${entry.n}: the introduction has no paragraph`);
    const book: GeneratedBook = {
      id: entry.b,
      name: entry.n,
      slug: slugOf(entry.n),
      testament: entry.t,
      chapters: entry.c,
      paragraph,
    };
    const missing = chapterUrls(book).filter((url) => !listed.has(url));
    if (missing.length > 0)
      throw new BookDataError(
        `${book.name}: ${missing.join(", ")} not in ${READER_SITEMAP}`,
      );
    books.push(book);
  }

  const generated = new Set(books.flatMap(chapterUrls));
  const extra = [...listed].filter((url) => !generated.has(url));
  if (extra.length > 0)
    throw new BookDataError(
      `${READER_SITEMAP} lists chapters no book has: ${extra.join(", ")}`,
    );
  return books;
}

export function compareBooks(
  committed: GeneratedBook[],
  current: GeneratedBook[],
) {
  const differences: string[] = [];
  const byId = new Map(committed.map((book) => [book.id, book]));
  for (const book of current) {
    const before = byId.get(book.id);
    byId.delete(book.id);
    if (!before) {
      differences.push(`${book.name}: missing from the committed file`);
      continue;
    }
    for (const field of Object.keys(book) as (keyof GeneratedBook)[]) {
      if (before[field] !== book[field])
        differences.push(
          `${book.name}: ${field} is ${JSON.stringify(before[field])} in the committed file, ${JSON.stringify(book[field])} now`,
        );
    }
  }
  for (const book of byId.values())
    differences.push(`${book.name}: no longer in VerseMate's book data`);
  return differences;
}

export const serialize = (books: GeneratedBook[]) =>
  `${JSON.stringify(books, null, 2)}\n`;

export async function run({
  fetcher,
  file,
  check,
}: {
  fetcher: Fetch;
  file: string;
  check: boolean;
}): Promise<{ ok: boolean; lines: string[] }> {
  let books: GeneratedBook[];
  try {
    books = await generateBooks(fetcher);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      lines: [
        error instanceof BookDataError
          ? `book data refused: ${reason}`
          : `book data could not be read: ${reason}`,
      ],
    };
  }
  const chapters = books.reduce((sum, book) => sum + book.chapters, 0);

  if (!check) {
    writeFileSync(file, serialize(books));
    return {
      ok: true,
      lines: [`wrote ${books.length} books and ${chapters} chapters to ${file}`],
    };
  }

  if (!existsSync(file))
    return { ok: false, lines: [`book data check: ${file} does not exist`] };
  const differences = compareBooks(
    JSON.parse(readFileSync(file, "utf8")) as GeneratedBook[],
    books,
  );
  if (differences.length > 0)
    return {
      ok: false,
      lines: [
        ...differences.map((line) => `book data differs: ${line}`),
        "run bun scripts/bible-books.ts and commit the file",
      ],
    };
  return {
    ok: true,
    lines: [
      `book data in step: ${books.length} books and ${chapters} chapters match VerseMate's book data`,
    ],
  };
}

if (import.meta.main) {
  const result = await run({
    fetcher: (url) => fetch(url),
    file: GENERATED_FILE,
    check: process.argv.includes("--check"),
  });
  for (const line of result.lines)
    (result.ok ? console.log : console.error)(line);
  process.exit(result.ok ? 0 : 1);
}

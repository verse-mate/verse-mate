import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_ORIGIN,
  chapterUrls,
  type GeneratedBook,
  READER_SITEMAP,
  run,
  serialize,
} from "./bible-books";

const BIBLE: GeneratedBook[] = JSON.parse(
  readFileSync(join(import.meta.dir, "../src/lib/bible-books.generated.json"), "utf8"),
);

type Api = {
  books: GeneratedBook[];
  sitemap?: string[];
};

const fakeFetch =
  ({ books, sitemap = books.flatMap(chapterUrls) }: Api) =>
  async (url: string) => {
    if (url === `${API_ORIGIN}/bible/testaments?bible_version=NASB1995`)
      return Response.json({
        testaments: [...books]
          .reverse()
          .map((book) => ({ b: book.id, n: book.name, t: book.testament, g: 1, c: book.chapters })),
      });
    const intro = /\/bible\/book\/(\d+)\/introduction$/.exec(url);
    if (intro) {
      const book = books.find((candidate) => candidate.id === Number(intro[1]));
      return Response.json({ introduction: { book_id: book?.id, biblical_role: book?.paragraph } });
    }
    if (url === READER_SITEMAP)
      return new Response(
        `<urlset>${sitemap.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>`,
      );
    return new Response("not found", { status: 404 });
  };

const scratch = () => join(mkdtempSync(join(tmpdir(), "bible-books-")), "books.json");

describe("bible-books generation", () => {
  it("writes the 66 books and 1,189 chapters in Bible order", async () => {
    const file = scratch();
    const result = await run({ fetcher: fakeFetch({ books: BIBLE }), file, check: false });

    expect(result.ok).toBe(true);
    const written: GeneratedBook[] = JSON.parse(readFileSync(file, "utf8"));
    expect(written).toHaveLength(66);
    expect(written.reduce((sum, book) => sum + book.chapters, 0)).toBe(1189);
    expect(written.map((book) => book.id)).toEqual(BIBLE.map((_, index) => index + 1));
    expect(written[0]).toMatchObject({ name: "Genesis", slug: "genesis", testament: "OT", chapters: 50 });
    expect(written.find((book) => book.name === "Song of Solomon")?.slug).toBe("song-of-solomon");
  });

  it("refuses to write when a chapter is missing from the reader's sitemap, naming the book", async () => {
    const file = scratch();
    const sitemap = BIBLE.flatMap(chapterUrls).filter(
      (url) => url !== "https://app.versemate.org/bible/romans/12",
    );
    const result = await run({ fetcher: fakeFetch({ books: BIBLE, sitemap }), file, check: false });

    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("Romans");
    expect(result.lines.join("\n")).toContain("/bible/romans/12");
    expect(existsSync(file)).toBe(false);
  });

  it("refuses to write when a paragraph is empty, naming the book", async () => {
    const file = scratch();
    const books = BIBLE.map((book) => (book.name === "Obadiah" ? { ...book, paragraph: "  " } : book));
    const result = await run({ fetcher: fakeFetch({ books }), file, check: false });

    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("Obadiah");
    expect(existsSync(file)).toBe(false);
  });

  it("refuses to write when the API lists 65 books", async () => {
    const file = scratch();
    const books = BIBLE.filter((book) => book.name !== "Jude");
    const result = await run({ fetcher: fakeFetch({ books }), file, check: false });

    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("65 books");
    expect(existsSync(file)).toBe(false);
  });
});

describe("bible-books --check", () => {
  const committed = (books: GeneratedBook[]) => {
    const file = scratch();
    writeFileSync(file, serialize(books));
    return file;
  };

  it("passes when the committed file matches the API", async () => {
    const result = await run({ fetcher: fakeFetch({ books: BIBLE }), file: committed(BIBLE), check: true });

    expect(result.ok).toBe(true);
  });

  it("fails on a changed chapter count, naming the book, and leaves the file alone", async () => {
    const stale = BIBLE.map((book) => (book.name === "Psalms" ? { ...book, chapters: 149 } : book));
    const file = committed(stale);
    const result = await run({ fetcher: fakeFetch({ books: BIBLE }), file, check: true });

    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("Psalms: chapters");
    expect(readFileSync(file, "utf8")).toBe(serialize(stale));
  });

  it("fails on a changed paragraph, naming the book", async () => {
    const edited = BIBLE.map((book) =>
      book.name === "Romans" ? { ...book, paragraph: `${book.paragraph} Edited.` } : book,
    );
    const result = await run({ fetcher: fakeFetch({ books: edited }), file: committed(BIBLE), check: true });

    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("Romans: paragraph");
  });
});

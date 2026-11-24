import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import BookPage, { getStaticPaths } from "../pages/bible/[book]";
import { bookMeta, BOOKS } from "../lib/bible-books";

const render = (slug: string) => {
  const path = `/bible/${slug}/`;
  const router = { asPath: path, pathname: "/bible/[book]", query: { book: slug }, route: "/bible/[book]" } as unknown as NextRouter;
  return renderToStaticMarkup(
    <RouterContext.Provider value={router}>
      <BookPage slug={slug} />
    </RouterContext.Provider>,
  );
};

const anchors = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: match[1],
    text: match[2].replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").trim(),
  }));

const chapterLinks = (html: string) =>
  anchors(html).filter((link) => /^https:\/\/app\.versemate\.org\/bible\/[a-z0-9-]+\/\d+$/.test(link.href));

const hrefs = (html: string) =>
  anchors(html).map((link) => (link.href.startsWith("/") && !link.href.endsWith("/") ? `${link.href}/` : link.href));

describe("a book page", () => {
  it("shows Romans with its paragraph and its 16 chapters in order", () => {
    const html = render("romans");
    const romans = BOOKS.find((book) => book.slug === "romans");

    expect(html).toMatch(/<h1[^>]*>Romans<\/h1>/);
    const shown = /<\/h1><p[^>]*>([^<]*)<\/p>/.exec(html)?.[1];
    expect(shown).toBe(romans?.paragraph.replace(/'/g, "&#x27;"));
    expect(shown).not.toBe("");
    expect(chapterLinks(html)).toEqual(
      Array.from({ length: 16 }, (_, index) => ({
        href: `https://app.versemate.org/bible/romans/${index + 1}`,
        text: `Romans ${index + 1}`,
      })),
    );
  });

  it("links the previous book, the next book and the list of books", () => {
    const links = anchors(render("romans")).map((link) => ({
      href: link.href.replace(/\/?$/, "/"),
      text: link.text,
    }));

    expect(links).toContainEqual({ href: "/bible/acts/", text: "Previous book: Acts" });
    expect(links).toContainEqual({ href: "/bible/1-corinthians/", text: "Next book: 1 Corinthians" });
    expect(links.map((link) => link.href)).toContain("/bible/");
  });

  it("carries the footer's links for AI assistants", () => {
    const html = render("romans");

    expect(hrefs(html)).toContain("https://versemate.org/llms.txt");
    expect(hrefs(html)).toContain("https://app.versemate.org/llms.txt");
  });

  it("gives Obadiah one chapter link", () => {
    expect(chapterLinks(render("obadiah")).map((link) => link.href)).toEqual([
      "https://app.versemate.org/bible/obadiah/1",
    ]);
  });

  it("gives Genesis no previous book and Revelation no next", () => {
    const genesis = hrefs(render("genesis"));
    const revelation = hrefs(render("revelation"));

    expect(genesis).toContain("/bible/exodus/");
    expect(genesis.some((href) => /^\/bible\/[a-z0-9-]+\/$/.test(href) && href !== "/bible/exodus/")).toBe(false);
    expect(revelation).toContain("/bible/jude/");
    expect(revelation.some((href) => /^\/bible\/[a-z0-9-]+\/$/.test(href) && href !== "/bible/jude/")).toBe(false);
  });

  it("titles and describes each book on its own", () => {
    const romans = bookMeta(BOOKS.find((book) => book.slug === "romans")!);
    const genesis = bookMeta(BOOKS.find((book) => book.slug === "genesis")!);

    expect(romans.title).toContain("Romans");
    expect(romans.description).toContain("Romans");
    expect(genesis.title).toContain("Genesis");
    expect(genesis.description).toContain("Genesis");
    expect(romans.title).not.toBe(genesis.title);
    expect(romans.description).not.toBe(genesis.description);
  });

  it("speaks of Obadiah's one chapter in the singular", () => {
    const obadiah = bookMeta(BOOKS.find((book) => book.slug === "obadiah")!);

    expect(obadiah.title).toContain("Obadiah: its one chapter");
    expect(obadiah.description).toContain("the one chapter of Obadiah");
  });
});

describe("the 66 book pages", () => {
  it("are one page per book and link 1,189 distinct chapters between them", async () => {
    const { paths } = await getStaticPaths({});
    const slugs = paths.map((path) => (typeof path === "string" ? path : path.params.book));

    expect(slugs).toHaveLength(66);
    const links = slugs.flatMap((slug) => chapterLinks(render(String(slug))).map((link) => link.href));
    expect(links).toHaveLength(1189);
    expect(new Set(links).size).toBe(1189);
  });
});

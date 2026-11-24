import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BooksOfTheBible } from "../components/sections/bible/BooksOfTheBible";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import Home from "../pages/index";

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);

describe("the home page", () => {
  it("links the popular chapters on the reader and the books page, as plain links", () => {
    const router = { asPath: "/", pathname: "/", query: {}, route: "/" } as unknown as NextRouter;
    const hrefs = links(
      renderToStaticMarkup(
        <RouterContext.Provider value={router}>
          <Home />
        </RouterContext.Provider>,
      ),
    );

    for (const chapter of [
      "genesis/1",
      "psalms/23",
      "john/3",
      "matthew/5",
      "romans/8",
    ]) {
      expect(hrefs).toContain(`https://app.versemate.org/bible/${chapter}`);
    }
    expect(hrefs.some((href) => /^\/bible\/?$/.test(href))).toBe(true);
  });
});

describe("the books page", () => {
  it("links all 66 books to their first chapter, under one heading per testament", () => {
    const html = renderToStaticMarkup(<BooksOfTheBible />);
    const sections = html.split(/<h2[^>]*>/).slice(1);

    expect(sections).toHaveLength(2);
    expect(sections[0]).toStartWith("Old Testament");
    expect(sections[1]).toStartWith("New Testament");
    expect(links(sections[0])).toHaveLength(39);
    expect(links(sections[1])).toHaveLength(27);
    expect(links(html)).toContain("https://app.versemate.org/bible/song-of-solomon/1");
    expect(links(html)).toContain("https://app.versemate.org/bible/1-corinthians/1");
    expect(links(html).every((href) => /^https:\/\/app\.versemate\.org\/bible\/[a-z0-9-]+\/1$/.test(href))).toBe(true);
  });
});

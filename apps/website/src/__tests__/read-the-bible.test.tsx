import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BooksOfTheBible } from "../components/sections/bible/BooksOfTheBible";
import ReadTheBible from "../components/sections/home/ReadTheBible";

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);

describe("the home page's Read the Bible section", () => {
  it("links the popular chapters on the reader and the books page, as plain links", () => {
    const hrefs = links(renderToStaticMarkup(<ReadTheBible />));

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

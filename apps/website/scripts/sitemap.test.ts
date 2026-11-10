import { describe, expect, it } from "bun:test";
import { buildSitemap } from "./sitemap";

const page = (file: string, head: string) => ({
  file,
  html: `<!DOCTYPE html><html><head>${head}</head><body></body></html>`,
});

describe("buildSitemap", () => {
  it("lists each indexable page at its canonical URL", () => {
    const { xml, missingCanonical } = buildSitemap([
      page("index.html", '<link rel="canonical" href="https://versemate.org"/>'),
      page(
        "about/index.html",
        '<link rel="canonical" href="https://versemate.org/about/"/>',
      ),
    ]);

    expect(missingCanonical).toEqual([]);
    expect(xml).toContain("<loc>https://versemate.org</loc>");
    expect(xml).toContain("<loc>https://versemate.org/about/</loc>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("leaves out pages that declare noindex", () => {
    const { xml, missingCanonical } = buildSitemap([
      page(
        "login/index.html",
        '<meta name="robots" content="noindex"/><link rel="canonical" href="https://versemate.org/login/"/>',
      ),
      page("404.html", '<meta content="noindex, nofollow" name="robots"/>'),
    ]);

    expect(xml).not.toContain("login");
    expect(missingCanonical).toEqual([]);
  });

  it("reports an indexable page with no canonical", () => {
    const { missingCanonical } = buildSitemap([
      page("localization-team/index.html", "<title>Team</title>"),
    ]);

    expect(missingCanonical).toEqual(["localization-team/index.html"]);
  });

  it("escapes the URL for XML", () => {
    const { xml } = buildSitemap([
      page(
        "a/index.html",
        '<link rel="canonical" href="https://versemate.org/a/?x=1&amp;y=2"/>',
      ),
    ]);

    expect(xml).toContain("<loc>https://versemate.org/a/?x=1&amp;y=2</loc>");
  });
});

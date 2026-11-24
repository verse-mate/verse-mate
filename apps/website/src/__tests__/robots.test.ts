import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import robotsParser from "robots-parser";

const served = readFileSync(join(import.meta.dir, "../../public/robots.txt"), "utf8");
const robots = robotsParser("https://versemate.org/robots.txt", served);

const ADMITTED = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Amazonbot",
  "SomeNewBot",
];

const REFUSED = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "CCBot",
  "Applebot-Extended",
  "cohere-ai",
  "MistralAI-Training",
  "meta-externalagent",
  "GoogleOther",
  "Google-CloudVertexBot",
  "Bytespider",
  "Diffbot",
  "omgili",
  "Baiduspider",
  "PetalBot",
  "AwarioSmartBot",
  "AwarioRssBot",
  "QualifiedBot",
  "Cotoyogi",
  "ICC-Crawler",
  "atlassian-bot",
  "FishBot",
  "BorderxBot",
  "NavuBot",
  "SemrushBot-SWA",
  "WARDBot",
  "magpie-crawler",
  "KimiBot",
  "CitibotSiteCrawler",
];

describe("versemate.org robots.txt as each crawler reads it", () => {
  it("lets search, answer and mixed-use crawlers read the whole site", () => {
    for (const agent of ADMITTED) {
      expect(robots.isAllowed("https://versemate.org/", agent)).toBe(true);
      expect(robots.isAllowed("https://versemate.org/about/", agent)).toBe(true);
    }
  });

  it("keeps training crawlers and commercial scrapers out of the whole site", () => {
    for (const agent of REFUSED) {
      expect(robots.isDisallowed("https://versemate.org/", agent)).toBe(true);
    }
  });

  it("carries one content signal: search and answers yes, training no", () => {
    const signals = served
      .split("\n")
      .filter((line) => /^content-signal:/i.test(line.trim()));
    expect(signals).toEqual([
      "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    ]);
    expect(served).not.toMatch(/use=/);
  });

  it("names OAI-SearchBot in a group of its own that starts with Allow: /", () => {
    const lines = served.split("\n").map((line) => line.trim());
    const index = lines.indexOf("User-agent: OAI-SearchBot");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(lines[index + 1]).toBe("Allow: /");
    const group = lines.slice(index, lines.indexOf("", index));
    expect(group.some((line) => /^content-signal:/i.test(line))).toBe(false);
  });

  it("names Google-Extended only in comments, one of them saying why it is not blocked", () => {
    const naming = served.split("\n").filter((line) => /google-extended/i.test(line));
    expect(naming.length).toBeGreaterThan(0);
    expect(naming.every((line) => line.trim().startsWith("#"))).toBe(true);
    expect(naming.some((line) => /on purpose/i.test(line))).toBe(true);
    expect(served).toMatch(/grounding in Gemini/);
  });

  it("names the site's own sitemap and the reader's sitemap index", () => {
    expect(robots.getSitemaps()).toEqual([
      "https://versemate.org/sitemap.xml",
      "https://app.versemate.org/sitemap.xml",
    ]);
  });
});

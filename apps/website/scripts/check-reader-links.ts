import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chapterUrl,
  POPULAR_CHAPTERS,
  READER_ORIGIN,
  TESTAMENTS,
} from "../src/lib/bible-books";

const SITEMAP = `${READER_ORIGIN}/sitemaps/bible-en-US.xml`;
const llms = readFileSync(join(import.meta.dir, "../public/llms.txt"), "utf8");

const failures: string[] = [];
const fail = (line: string) => {
  failures.push(line);
  console.error(`FAIL ${line}`);
};

const sitemapResponse = await fetch(SITEMAP);
if (!sitemapResponse.ok) {
  console.error(`FAIL ${SITEMAP}: HTTP ${sitemapResponse.status}`);
  process.exit(1);
}
const listed = new Set(
  [...(await sitemapResponse.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  ),
);

const chapters = [
  ...TESTAMENTS.flatMap((testament) =>
    testament.books.map((book) => chapterUrl(book.slug, 1)),
  ),
  ...POPULAR_CHAPTERS.map((popular) => chapterUrl(popular.slug, popular.chapter)),
];
for (const url of chapters) {
  if (!listed.has(url)) fail(`${url} is not in ${SITEMAP}`);
}
console.log(`checked ${chapters.length} chapter links against ${SITEMAP}`);

const linked = [
  ...new Set(
    [...llms.matchAll(/https:\/\/[^\s)`>]+/g)].map((match) =>
      match[0].replace(/[.,]$/, ""),
    ),
  ),
].filter((url) => !url.includes("{"));
for (const url of linked) {
  const response = await fetch(url);
  if (response.status !== 200) fail(`${url} (llms.txt): HTTP ${response.status}`);
}
console.log(`checked ${linked.length} links in llms.txt`);

const negotiated = await fetch(chapterUrl("matthew", 5), {
  headers: { accept: "text/markdown" },
});
const type = negotiated.headers.get("content-type") ?? "";
if (!type.startsWith("text/markdown"))
  fail(`${chapterUrl("matthew", 5)} with Accept: text/markdown answered ${type}`);
console.log("checked the Accept: text/markdown answer llms.txt describes");

if (failures.length > 0) {
  console.error(`${failures.length} reader link check(s) failed`);
  process.exit(1);
}
console.log("every reader link answers");

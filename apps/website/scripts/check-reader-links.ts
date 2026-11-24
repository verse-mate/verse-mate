import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOKS,
  chapterUrl,
  POPULAR_CHAPTERS,
} from "../src/lib/bible-books";
import {
  GENERATED_FILE,
  READER_SITEMAP,
  run as checkBookData,
  sitemapUrls,
} from "./bible-books";

const llms = readFileSync(join(import.meta.dir, "../public/llms.txt"), "utf8");

const failures: string[] = [];
const fail = (line: string) => {
  failures.push(line);
  console.error(`FAIL ${line}`);
};

let listed: Set<string>;
try {
  listed = await sitemapUrls((url) => fetch(url));
} catch (error) {
  console.error(`FAIL ${READER_SITEMAP}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const bookChapters = BOOKS.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, index) =>
    chapterUrl(book.slug, index + 1),
  ),
);
const linkedChapters = new Set([
  ...bookChapters,
  ...POPULAR_CHAPTERS.map((popular) => chapterUrl(popular.slug, popular.chapter)),
]);
for (const url of linkedChapters) {
  if (!listed.has(url)) fail(`${url} is not in ${READER_SITEMAP}`);
}
for (const url of listed) {
  if (!linkedChapters.has(url)) fail(`${url} is in ${READER_SITEMAP} but no book page links it`);
}
console.log(
  `checked ${linkedChapters.size} chapter links (${bookChapters.length} on the book pages) against the ${listed.size} chapters of ${READER_SITEMAP}`,
);

const bookData = await checkBookData({
  fetcher: (url) => fetch(url),
  file: GENERATED_FILE,
  check: true,
});
for (const line of bookData.lines) {
  if (bookData.ok) console.log(line);
  else fail(line);
}

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

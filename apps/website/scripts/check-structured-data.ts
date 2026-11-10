import { readFileSync } from "node:fs";

const urlsIn = (value: unknown): string[] => {
  if (typeof value === "string")
    return /^https?:\/\//.test(value) && !value.includes("schema.org")
      ? [value]
      : [];
  if (Array.isArray(value)) return value.flatMap(urlsIn);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) =>
      key === "@id" ? [] : urlsIn(child),
    );
  return [];
};

const page = process.argv[2] ?? "out/index.html";
const html = readFileSync(page, "utf8");
const blocks = [
  ...html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  ),
].map((match) => JSON.parse(match[1]));

if (blocks.length === 0) {
  console.error(`structured data: none found in ${page}`);
  process.exit(1);
}

const urls = [...new Set(blocks.flatMap(urlsIn))];
const results = await Promise.all(
  urls.map(async (url) => {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (structured-data link check)" },
      });
      return { url, status: response.status };
    } catch (error) {
      return { url, status: 0, error: String(error) };
    }
  }),
);

for (const { url, status, error } of results)
  console.log(`${status} ${url}${error ? ` (${error})` : ""}`);

const dead = results.filter(({ status }) => status !== 200);
if (dead.length) {
  console.error(`structured data: ${dead.length} URL(s) did not answer 200`);
  process.exit(1);
}
console.log(`structured data: ${urls.length} URLs, all 200`);

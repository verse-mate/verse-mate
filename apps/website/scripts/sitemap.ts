import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

type Page = { file: string; html: string };

const tagAttr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

const tags = (html: string, element: string) =>
  html.match(new RegExp(`<${element}\\b[^>]*>`, "gi")) ?? [];

const isNoindex = (html: string) =>
  tags(html, "meta").some(
    (tag) =>
      tagAttr(tag, "name")?.toLowerCase() === "robots" &&
      /\bnoindex\b/i.test(tagAttr(tag, "content") ?? ""),
  );

const canonicalOf = (html: string) =>
  tags(html, "link")
    .find((tag) => tagAttr(tag, "rel")?.toLowerCase() === "canonical")
    ?.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1];

const decode = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function buildSitemap(pages: Page[]) {
  const urls: string[] = [];
  const missingCanonical: string[] = [];
  for (const { file, html } of pages) {
    if (isNoindex(html)) continue;
    const canonical = canonicalOf(html);
    if (!canonical) missingCanonical.push(file);
    else urls.push(decode(canonical));
  }
  const body = [...new Set(urls)]
    .sort()
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  return { xml, missingCanonical };
}

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });

if (import.meta.main) {
  const outDir = process.argv[2] ?? "out";
  const pages = htmlFiles(outDir).map((path) => ({
    file: relative(outDir, path),
    html: readFileSync(path, "utf8"),
  }));
  const { xml, missingCanonical } = buildSitemap(pages);
  if (missingCanonical.length) {
    console.error(
      `sitemap: these pages are indexable but declare no canonical URL. Give each a canonical, or mark it noindex:\n${missingCanonical.map((file) => `  ${file}`).join("\n")}`,
    );
    process.exit(1);
  }
  writeFileSync(join(outDir, "sitemap.xml"), xml);
  console.log(
    `sitemap: wrote ${outDir}/sitemap.xml with ${xml.split("<url>").length - 1} URLs`,
  );
}

import { readdirSync, readFileSync } from "node:fs";

const ENDPOINT = "https://api.indexnow.org/indexnow";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Result = { ok: boolean; status: number; detail?: string };

export const urlsFromSitemap = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&"),
  );

export async function submitToIndexNow({
  host,
  key,
  urls,
  fetcher = fetch,
}: {
  host: string;
  key: string;
  urls: string[];
  fetcher?: Fetcher;
}): Promise<Result> {
  try {
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls,
      }),
    });
    if (response.ok) return { ok: true, status: response.status };
    return {
      ok: false,
      status: response.status,
      detail: (await response.text()).slice(0, 500),
    };
  } catch (error) {
    return { ok: false, status: 0, detail: String(error) };
  }
}

const keyIn = (publicDir: string) => {
  const files = readdirSync(publicDir).filter((name) =>
    /^[0-9a-f]{32}\.txt$/.test(name),
  );
  if (files.length !== 1)
    throw new Error(
      `indexnow: expected one <32 hex>.txt key file in ${publicDir}, found ${files.length}`,
    );
  return files[0].replace(/\.txt$/, "");
};

if (import.meta.main) {
  const [host = "versemate.org", sitemapPath = "out/sitemap.xml"] =
    process.argv.slice(2);
  const key = keyIn("public");
  const urls = urlsFromSitemap(readFileSync(sitemapPath, "utf8"));
  const result = await submitToIndexNow({ host, key, urls });
  const line = `indexnow: ${urls.length} URLs for ${host}, HTTP ${result.status}`;
  if (result.ok) console.log(line);
  else {
    console.error(`${line}, submission failed: ${result.detail ?? ""}`);
    process.exit(1);
  }
}

import { describe, expect, it } from "bun:test";
import { submitToIndexNow, urlsFromSitemap } from "./indexnow";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://versemate.org</loc></url>
  <url><loc>https://versemate.org/a/?x=1&amp;y=2</loc></url>
</urlset>`;

describe("urlsFromSitemap", () => {
  it("reads every loc, unescaped", () => {
    expect(urlsFromSitemap(sitemap)).toEqual([
      "https://versemate.org",
      "https://versemate.org/a/?x=1&y=2",
    ]);
  });
});

describe("submitToIndexNow", () => {
  const key = "0123456789abcdef0123456789abcdef";

  it("posts the URLs with the key and its location", async () => {
    let sent: { url: string; body: unknown } | undefined;
    const result = await submitToIndexNow({
      host: "versemate.org",
      key,
      urls: ["https://versemate.org"],
      fetcher: async (url, init) => {
        sent = { url: String(url), body: JSON.parse(String(init?.body)) };
        return new Response(null, { status: 202 });
      },
    });

    expect(result).toEqual({ ok: true, status: 202 });
    expect(sent?.url).toBe("https://api.indexnow.org/indexnow");
    expect(sent?.body).toEqual({
      host: "versemate.org",
      key,
      keyLocation: `https://versemate.org/${key}.txt`,
      urlList: ["https://versemate.org"],
    });
  });

  it("reports a refused submission as a failure with its status", async () => {
    const result = await submitToIndexNow({
      host: "versemate.org",
      key,
      urls: ["https://versemate.org"],
      fetcher: async () => new Response("bad key", { status: 403 }),
    });

    expect(result).toEqual({ ok: false, status: 403, detail: "bad key" });
  });

  it("reports an unreachable endpoint as a failure", async () => {
    const result = await submitToIndexNow({
      host: "versemate.org",
      key,
      urls: ["https://versemate.org"],
      fetcher: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.detail).toContain("ECONNREFUSED");
  });
});

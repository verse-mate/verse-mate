import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import crawlersPlugin from "./crawlers.plugin";

const app = new Elysia()
  .use(crawlersPlugin)
  .get("/health", () => ({ status: "ok" }))
  .get("/bible/book/1/1", () => ({ verses: [] }));

function get(pathname: string, userAgent?: string) {
  const headers = new Headers();
  if (userAgent !== undefined) headers.set("user-agent", userAgent);
  return app.handle(new Request(`http://localhost${pathname}`, { headers }));
}

const AI_CRAWLERS = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Claude-Web/1.0 (web crawler; +https://www.anthropic.com/)",
  "Claude-User/1.0",
  "anthropic-ai",
  "CCBot/2.0 (https://commoncrawl.org/faq/)",
  "Google-Extended",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "cohere-ai",
  "Mozilla/5.0 (compatible; Diffbot/0.1; +http://www.diffbot.com)",
  "gptbot",
];

const NORMAL_CLIENTS = [
  "VerseMate/42 CFNetwork/3826.500.131 Darwin/24.5.0",
  "okhttp/4.12.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "curl/8.7.1",
  "DigitalOcean Uptime Probe 0.22.0 (https://digitalocean.com)",
  "kube-probe/1.31",
  "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
  "Better Uptime Bot Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "",
];

describe("robots.txt", () => {
  it("disallows every crawler from the whole API", async () => {
    const response = await get("/robots.txt");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/plain");
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("is still served to an AI crawler", async () => {
    const response = await get("/robots.txt", AI_CRAWLERS[0]);

    expect(response.status).toBe(200);
  });
});

describe("AI crawler block", () => {
  for (const userAgent of AI_CRAWLERS) {
    it(`refuses ${userAgent}`, async () => {
      const response = await get("/bible/book/1/1", userAgent);

      expect(response.status).toBe(403);
    });
  }

  it("still answers /health to an AI crawler", async () => {
    const response = await get("/health", AI_CRAWLERS[0]);

    expect(response.status).toBe(200);
  });

  it("serves a request with no user agent", async () => {
    const response = await get("/bible/book/1/1");

    expect(response.status).toBe(200);
  });

  for (const userAgent of NORMAL_CLIENTS) {
    it(`serves "${userAgent}"`, async () => {
      const response = await get("/bible/book/1/1", userAgent);

      expect(response.status).toBe(200);
    });
  }
});

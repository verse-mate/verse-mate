import { Elysia } from "elysia";

export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "YouBot",
  "AI2Bot",
  "Omgilibot",
  "ImagesiftBot",
  "Timpibot",
  "DuckAssistBot",
  "MistralAI-User",
  "PanguBot",
];

const AI_CRAWLER = new RegExp(
  `(?<![\\w-])(?:${AI_CRAWLER_USER_AGENTS.join("|")})(?![\\w-])`,
  "i",
);

const ALWAYS_SERVED_PATHS = new Set(["/robots.txt", "/health"]);

const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

const plugin = new Elysia()
  .onRequest(({ request }) => {
    if (ALWAYS_SERVED_PATHS.has(new URL(request.url).pathname)) return;
    if (AI_CRAWLER.test(request.headers.get("user-agent") ?? "")) {
      return new Response("Forbidden", { status: 403 });
    }
  })
  .get(
    "/robots.txt",
    () =>
      new Response(ROBOTS_TXT, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  );

export default plugin;

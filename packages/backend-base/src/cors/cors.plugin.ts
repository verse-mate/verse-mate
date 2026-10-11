import { cors } from "@elysiajs/cors";

type CorsEnv = Record<string, string | undefined>;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.versemate.org",
  "https://admin.versemate.org",
  "https://staging.app.verse-mate.xyz",
  "https://versemate.org",
  "https://www.versemate.org",
  "https://verse-mate.xyz",
  "https://www.verse-mate.xyz",
];

const WORKERS_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.verse-mate\.workers\.dev$/;

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

function exactOrigins(env: CorsEnv): Set<string> {
  const configured = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function createOriginCheck(env: CorsEnv = process.env) {
  const exact = exactOrigins(env);
  const allowLocal = LOCAL_ENVIRONMENTS.has(env.ENVIRONMENT ?? "");

  return (origin: string | null): boolean => {
    if (!origin) return false;
    if (exact.has(origin)) return true;
    if (WORKERS_PREVIEW_ORIGIN.test(origin)) return true;
    return allowLocal && LOCAL_ORIGIN.test(origin);
  };
}

export function createCorsPlugin(env: CorsEnv = process.env) {
  const isAllowedOrigin = createOriginCheck(env);

  return cors({
    origin: (request) => isAllowedOrigin(request.headers.get("origin")),
  });
}

export default createCorsPlugin();

import { cors } from "@elysiajs/cors";

type CorsEnv = Record<string, string | undefined>;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.versemate.org",
  "https://admin.versemate.org",
  "https://mobile.versemate.org",
  "https://staging.app.verse-mate.xyz",
  "https://versemate.org",
  "https://www.versemate.org",
  "https://verse-mate.xyz",
  "https://www.verse-mate.xyz",
];

const PREVIEW_WORKERS = [
  "verse-mate-web-preview",
  "verse-mate-web-staging",
  "v-m-preview",
  "v-m-preview-app",
  "verse-mate-staging-app",
  "verse-mate-production",
  "verse-mate-website-preview",
  "verse-mate-website-staging",
  "verse-mate-website-production",
  "verse-mate-mobile-web",
  "verse-mate-mobile-web-preview",
];

const PREVIEW_ORIGIN = new RegExp(
  `^https://(?:[a-z0-9-]+-)?(?:${PREVIEW_WORKERS.join("|")})\\.verse-mate\\.workers\\.dev$`,
);

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const LOCAL_ENVIRONMENTS = new Set(["development", "test"]);

const PREFLIGHT_MAX_AGE_SECONDS = 600;

function parseOrigin(value: string): string {
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    origin = "";
  }
  if (origin !== value) {
    throw new Error(
      `CORS_ALLOWED_ORIGINS entry "${value}" is not an origin like https://example.org`,
    );
  }
  return origin;
}

function exactOrigins(env: CorsEnv): Set<string> {
  const configured = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(parseOrigin);

  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function createOriginCheck(env: CorsEnv) {
  const exact = exactOrigins(env);
  const allowLocal = LOCAL_ENVIRONMENTS.has(env.ENVIRONMENT ?? "");

  return (origin: string | null): boolean => {
    if (!origin) return false;
    if (exact.has(origin)) return true;
    if (PREVIEW_ORIGIN.test(origin)) return true;
    return allowLocal && LOCAL_ORIGIN.test(origin);
  };
}

export function createCorsPlugin(env: CorsEnv = process.env) {
  const isAllowedOrigin = createOriginCheck(env);

  return cors({
    origin: (request) => isAllowedOrigin(request.headers.get("origin")),
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });
}

export default createCorsPlugin();

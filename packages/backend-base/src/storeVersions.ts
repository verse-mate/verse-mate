/**
 * The version of the app that is live on each store right now.
 *
 * `/api/version-policy` uses it so the app's update prompt appears when a new
 * version is actually downloadable, not when someone remembers to raise
 * `minVersion` after both stores approved it (Sebastian, 2026-11-02).
 *
 * - iOS: Apple's public lookup API (no credentials).
 * - Android: the Play Developer API's production track, read with a
 *   service account that has only "View app information" on the app
 *   (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`). Only `completed` releases count:
 *   a staged rollout is not yet downloadable by everyone it would prompt.
 *
 * Both stores report the version as a release name ("v1.6.0" on both today),
 * so the store releases must be named after the app version they ship.
 *
 * Answers are cached in Redis (an hour; ten minutes for a failed lookup), so
 * the stores are asked only when apps ask the backend, and rarely.
 */
import { createSign } from "node:crypto";
import semver from "semver";
import type { cache as Cache } from "./shared/shared.plugin";

export type StorePlatform = "ios" | "android";

export const APP_BUNDLE_ID = "org.versemate.app";
export const PLAY_PACKAGE_NAME = "org.versemate.app";

const LIVE_TTL = "1h";
const FAILED_TTL = "10m";
const cacheKey = (platform: StorePlatform) => `store_live_version:${platform}`;

type Fetch = typeof fetch;

/**
 * The platform asking. New builds say so (`?platform=`); builds already in the
 * stores do not, but their HTTP stacks name themselves in the User-Agent:
 * okhttp on Android, CFNetwork/Darwin on iOS.
 */
export function platformFrom(
  query: string | undefined,
  userAgent: string | null | undefined,
): StorePlatform | null {
  if (query === "ios" || query === "android") return query;
  if (!userAgent) return null;
  if (/okhttp|android/i.test(userAgent)) return "android";
  if (/cfnetwork|darwin|iphone|ipad|\bios\b/i.test(userAgent)) return "ios";
  return null;
}

/** "v1.6.0", "1.6.0" or "1.6" → "1.6.0"; anything else → null. */
export function versionFromStoreName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/^v/i, "");
  const exact = semver.valid(trimmed);
  if (exact) return exact;
  if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) return null;
  return semver.coerce(trimmed)?.version ?? null;
}

export async function fetchIosStoreVersion(
  fetchImpl: Fetch = fetch,
  bundleId = APP_BUNDLE_ID,
): Promise<string | null> {
  const country = process.env.APP_STORE_COUNTRY || "us";
  const res = await fetchImpl(
    `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${encodeURIComponent(country)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { results?: Array<{ version?: unknown }> };
  return versionFromStoreName(body.results?.[0]?.version);
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

async function playAccessToken(
  sa: ServiceAccount,
  fetchImpl: Fetch,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key, "base64url");
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

/** The highest version among the production track's completed releases. */
export async function fetchPlayStoreVersion(
  fetchImpl: Fetch = fetch,
  serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
  packageName = PLAY_PACKAGE_NAME,
): Promise<string | null> {
  if (!serviceAccountJson) return null;
  const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  const token = await playAccessToken(sa, fetchImpl);
  if (!token) return null;

  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
  const call = (method: string, path: string) =>
    fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

  // Every read of a track goes through an edit; it is deleted again unchanged.
  const edit = await call("POST", "/edits");
  if (!edit.ok) return null;
  const { id } = (await edit.json()) as { id: string };
  try {
    const track = await call(
      "GET",
      `/edits/${encodeURIComponent(id)}/tracks/production`,
    );
    if (!track.ok) return null;
    const { releases = [] } = (await track.json()) as {
      releases?: Array<{ status?: string; name?: string }>;
    };
    const versions = releases
      .filter((r) => r.status === "completed")
      .map((r) => versionFromStoreName(r.name))
      .filter((v): v is string => v !== null);
    return versions.length ? semver.rsort(versions)[0] : null;
  } finally {
    await call("DELETE", `/edits/${encodeURIComponent(id)}`).catch(
      () => undefined,
    );
  }
}

/** The live version on that platform's store, or null when it cannot be read. */
export async function liveStoreVersion(
  platform: StorePlatform,
  cache: Cache,
  fetchImpl: Fetch = fetch,
): Promise<string | null> {
  try {
    const cached = await cache.get<{ version: string | null }>(
      cacheKey(platform),
    );
    if (cached) return cached.version;
  } catch {
    // A cache miss or a cache outage both fall through to the store.
  }
  let version: string | null = null;
  try {
    version =
      platform === "ios"
        ? await fetchIosStoreVersion(fetchImpl)
        : await fetchPlayStoreVersion(fetchImpl);
  } catch (error) {
    console.warn(`[version-policy] ${platform} store lookup failed:`, error);
  }
  try {
    await cache.set(
      cacheKey(platform),
      { version },
      version ? LIVE_TTL : FAILED_TTL,
    );
  } catch {
    // Not caching only means asking the store again next time.
  }
  return version;
}

export const STORE_VERSION_CACHE_KEY = cacheKey;

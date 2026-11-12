import type { CaptureResult } from "posthog-js";
import { boundCampaignValue } from "./first-touch";

const URL_KEY = /(^\$?|_)(url|referrer|href)$/i;
const CAMPAIGN_KEY = /(^|_)utm_(source|medium|campaign|content|term)$/;
const SEARCH_KEYWORD = /(^|_)ph_keyword$/;
const QUERY_PROPERTIES = ["search", "$search"];
const EMBEDDED_QUERY =
  /((?:https?:\/\/|href=")[^\s"'?#\\()<>[\]]*)(?:[?#][^\s"'\\()<>[\]]*)?/g;
const TEXT_TOKEN = /[^\s"'`\\()<>[\]]+/g;
const PATH_START = /^\/|[=:]\//;

export function stripQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

function stripRelativeQuery(token: string): string {
  const cut = token.search(/[?#]/);
  return cut > 0 && PATH_START.test(token.slice(0, cut))
    ? token.slice(0, cut)
    : token;
}

function scrubText(text: string, key: string): string {
  if (CAMPAIGN_KEY.test(key)) return boundCampaignValue(text);
  if (URL_KEY.test(key)) return stripQuery(text);
  return text.replace(EMBEDDED_QUERY, "$1").replace(TEXT_TOKEN, stripRelativeQuery);
}

function scrubValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") return scrubText(value, key);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, key));
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrubValue(v, k)]),
    );
  }
  return value;
}

function scrubHeatmap(data: Record<string, unknown[]>): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [url, points] of Object.entries(data)) {
    if (Array.isArray(points)) {
      const key = stripQuery(url);
      out[key] = [...(out[key] ?? []), ...points];
    }
  }
  return out;
}

function scrubProperties<T extends Record<string, unknown> | undefined>(props: T): T {
  if (!props) return props;
  const out = scrubValue(props) as Record<string, unknown>;
  for (const key of QUERY_PROPERTIES) delete out[key];
  for (const key of Object.keys(out)) if (SEARCH_KEYWORD.test(key)) delete out[key];
  if (out.$heatmap_data) {
    out.$heatmap_data = scrubHeatmap(out.$heatmap_data as Record<string, unknown[]>);
  }
  return out as T;
}

export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  try {
    return {
      ...event,
      properties: scrubProperties(event.properties),
      ...(event.$set ? { $set: scrubProperties(event.$set) } : {}),
      ...(event.$set_once ? { $set_once: scrubProperties(event.$set_once) } : {}),
    };
  } catch {
    return null;
  }
}

const INITIAL_PERSON_INFO = "$initial_person_info";
const LEGACY_INITIAL_INFO = ["$initial_campaign_params", "$initial_referrer_info"];
const LANDING_CAMPAIGN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gad_source",
];
const DIRECT = "$direct";
const STORED_LIMIT = 1000;

type StoredPersonInfo = { r?: string; u?: string };

export type InitialInfoStore = {
  props: Record<string, unknown>;
  register(props: Record<string, unknown>): boolean;
};

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

export function scrubLandingUrl(url: string, ownHost?: string): string | undefined {
  const parsed = parseUrl(url);
  if (!parsed) return undefined;
  const kept = new URLSearchParams();
  for (const key of LANDING_CAMPAIGN_PARAMS) {
    const value = parsed.searchParams.get(key);
    if (value) kept.set(key, boundCampaignValue(value));
  }
  const query = kept.toString();
  const path = ownHost === undefined || parsed.host === ownHost ? parsed.pathname : "";
  return `${parsed.origin}${path}${query ? `?${query}` : ""}`.slice(0, STORED_LIMIT);
}

function scrubReferrer(referrer: string, keepPath: boolean): string | undefined {
  if (referrer === DIRECT) return referrer;
  const parsed = parseUrl(referrer);
  if (!parsed) return undefined;
  return (keepPath ? `${parsed.origin}${parsed.pathname}` : parsed.origin).slice(0, STORED_LIMIT);
}

function scrubPersonInfo(info: Record<string, unknown>, ownHost: string): StoredPersonInfo {
  const landing = typeof info.u === "string" ? parseUrl(info.u) : undefined;
  const ownLanding = landing === undefined || landing.host === ownHost;
  return {
    r: typeof info.r === "string" ? scrubReferrer(info.r, ownLanding) : undefined,
    u: typeof info.u === "string" ? scrubLandingUrl(info.u, ownHost) : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubStoredInitialInfo(store: InitialInfoStore | undefined, win: Window): void {
  if (!store) return;
  const ownHost = new URL(win.location.href).host;
  const scrubbed: Record<string, unknown> = {};
  for (const key of LEGACY_INITIAL_INFO) {
    const value = store.props[key];
    if (isRecord(value)) scrubbed[key] = scrubProperties(value);
  }
  const hasLegacyRecord = Object.keys(scrubbed).length > 0;
  const stored = store.props[INITIAL_PERSON_INFO];
  if (stored !== undefined || !hasLegacyRecord) {
    const info = isRecord(stored)
      ? stored
      : { r: win.document.referrer || DIRECT, u: win.location.href };
    scrubbed[INITIAL_PERSON_INFO] = scrubPersonInfo(info, ownHost);
  }
  const changed = Object.entries(scrubbed).filter(
    ([key, value]) => JSON.stringify(store.props[key]) !== JSON.stringify(value),
  );
  if (changed.length > 0) store.register(Object.fromEntries(changed));
}

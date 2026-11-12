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

type StoredPersonInfo = { r?: string; u?: string };

export type InitialInfoStore = {
  props: Record<string, unknown>;
  register(props: Record<string, unknown>): boolean;
};

export function scrubLandingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const kept = new URLSearchParams();
    for (const key of LANDING_CAMPAIGN_PARAMS) {
      const value = parsed.searchParams.get(key);
      if (value) kept.set(key, boundCampaignValue(value));
    }
    const query = kept.toString();
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return stripQuery(url);
  }
}

function scrubPersonInfo(info: StoredPersonInfo): StoredPersonInfo {
  return {
    r: info.r === undefined || info.r === DIRECT ? info.r : stripQuery(info.r),
    u: info.u === undefined ? info.u : scrubLandingUrl(info.u),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubStoredInitialInfo(store: InitialInfoStore | undefined, win: Window): void {
  if (!store) return;
  const updates: Record<string, unknown> = {};
  for (const key of LEGACY_INITIAL_INFO) {
    const value = store.props[key];
    if (isRecord(value)) updates[key] = scrubProperties(value);
  }
  const stored = store.props[INITIAL_PERSON_INFO];
  if (isRecord(stored)) {
    updates[INITIAL_PERSON_INFO] = scrubPersonInfo(stored as StoredPersonInfo);
  } else if (Object.keys(updates).length === 0) {
    updates[INITIAL_PERSON_INFO] = scrubPersonInfo({
      r: win.document.referrer || DIRECT,
      u: win.location.href,
    });
  }
  store.register(updates);
}

import type { CaptureResult } from "posthog-js";
import { boundCampaignValue } from "./first-touch";

const URL_KEY = /(^\$?|_)(url|referrer|href)$/i;
const CAMPAIGN_KEY = /^(\$initial_)?utm_(source|medium|campaign|content|term)$/;
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

function scrubProperties<T extends Record<string, unknown> | undefined>(props: T): T {
  if (!props) return props;
  const out = scrubValue(props) as Record<string, unknown>;
  for (const key of QUERY_PROPERTIES) delete out[key];
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

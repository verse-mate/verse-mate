export type Channel =
  | "ai"
  | "campaign"
  | "internal"
  | "search"
  | "social"
  | "referral"
  | "direct";

export type Surface = "website" | "reader";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type UtmKey = (typeof UTM_KEYS)[number];

export type FirstTouch = {
  channel: Channel;
  ai_source?: string;
  referring_domain?: string;
  landing_path: string;
} & Partial<Record<UtmKey, string>>;

export type StoredFirstTouch = { channel: Channel; ai_source?: string; at: string };

export const FIRST_TOUCH_KEY = "vm_first_touch";

const AI_ASSISTANTS: [string, string][] = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["claude.ai", "claude"],
  ["gemini.google.com", "gemini"],
  ["copilot.microsoft.com", "copilot"],
];

const OWN_DOMAINS = ["versemate.org"];

const SEARCH_DOMAINS = [
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "yandex.ru",
  "yandex.com",
  "baidu.com",
  "ecosia.org",
  "search.brave.com",
];

const GOOGLE_HOST = /(^|\.)google\.(com|[a-z]{2}|com?\.[a-z]{2})$/;

const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "t.co",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "lnkd.in",
  "youtube.com",
  "reddit.com",
  "tiktok.com",
  "pinterest.com",
  "threads.net",
  "whatsapp.com",
];

const MAX_CAMPAIGN_LENGTH = 100;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function boundCampaignValue(value: string): string {
  return EMAIL.test(value) ? "[redacted]" : value.slice(0, MAX_CAMPAIGN_LENGTH);
}

function matches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function matchesAny(host: string, domains: string[]): boolean {
  return domains.some((domain) => matches(host, domain));
}

function referrerHost(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function aiSource(host: string | undefined, utmSource: string | undefined) {
  const source = utmSource?.toLowerCase();
  for (const [domain, name] of AI_ASSISTANTS) {
    if (host && matches(host, domain)) return name;
    if (source === domain || source === name) return name;
  }
  return undefined;
}

function channelFor(host: string | undefined, hasUtm: boolean): Channel {
  if (hasUtm) return "campaign";
  if (!host) return "direct";
  if (matchesAny(host, OWN_DOMAINS)) return "internal";
  if (GOOGLE_HOST.test(host) || matchesAny(host, SEARCH_DOMAINS)) return "search";
  if (matchesAny(host, SOCIAL_DOMAINS)) return "social";
  return "referral";
}

export function classifyFirstTouch({
  url,
  referrer,
}: {
  url: string;
  referrer: string;
}): FirstTouch {
  const location = new URL(url);
  const utms: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = location.searchParams.get(key);
    if (value) utms[key] = boundCampaignValue(value);
  }
  const host = referrerHost(referrer);
  const ai = aiSource(host, location.searchParams.get("utm_source") ?? undefined);
  const touch: FirstTouch = {
    channel: ai ? "ai" : channelFor(host, Object.keys(utms).length > 0),
    landing_path: location.pathname,
    ...utms,
  };
  if (ai) touch.ai_source = ai;
  if (host) touch.referring_domain = host;
  return touch;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PosthogLike = {
  capture: (event: string, properties: Record<string, unknown>) => unknown;
  register: (properties: Record<string, unknown>) => unknown;
};

const CHANNELS: Channel[] = [
  "ai",
  "campaign",
  "internal",
  "search",
  "social",
  "referral",
  "direct",
];
const AI_SOURCES = new Set(AI_ASSISTANTS.map(([, name]) => name));

function isStoredFirstTouch(value: unknown): value is StoredFirstTouch {
  if (!value || typeof value !== "object") return false;
  const touch = value as Record<string, unknown>;
  if (!CHANNELS.includes(touch.channel as Channel)) return false;
  return touch.ai_source === undefined || AI_SOURCES.has(touch.ai_source as string);
}

export function readFirstTouch(storage: StorageLike): StoredFirstTouch | undefined {
  try {
    const raw = storage.getItem(FIRST_TOUCH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return isStoredFirstTouch(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const listeners = new Set<(touch: StoredFirstTouch) => void>();

export function onFirstTouch(listener: (touch: StoredFirstTouch) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerFirstTouch(posthog: PosthogLike, touch: StoredFirstTouch) {
  posthog.register({
    first_touch_channel: touch.channel,
    ...(touch.ai_source ? { first_touch_ai_source: touch.ai_source } : {}),
  });
}

export function recordFirstTouch({
  posthog,
  storage,
  surface,
  url,
  referrer,
  returning,
}: {
  posthog: PosthogLike;
  storage: StorageLike;
  surface: Surface;
  url: string;
  referrer: string;
  returning: boolean;
}): StoredFirstTouch | undefined {
  let stored = readFirstTouch(storage);
  if (!stored) {
    const touch = classifyFirstTouch({ url, referrer });
    const next: StoredFirstTouch = {
      channel: touch.channel,
      ...(touch.ai_source ? { ai_source: touch.ai_source } : {}),
      at: new Date().toISOString(),
    };
    try {
      storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(next));
    } catch {
      return undefined;
    }
    stored = next;
    registerFirstTouch(posthog, stored);
    posthog.capture("acquisition_first_touch", { ...touch, surface, returning });
  } else {
    registerFirstTouch(posthog, stored);
  }
  for (const listener of listeners) listener(stored);
  return stored;
}

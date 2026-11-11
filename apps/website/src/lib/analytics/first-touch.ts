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

const MAX_DECODE_PASSES = 5;
const PERCENT_ESCAPE = /%([0-9a-f]{2})/gi;

function decodeEscape(_: string, hex: string): string {
  return String.fromCharCode(Number.parseInt(hex, 16));
}

function percentDecoded(value: string): string | undefined {
  let current = value;
  for (let pass = 0; pass <= MAX_DECODE_PASSES; pass++) {
    const next = current.replace(PERCENT_ESCAPE, decodeEscape);
    if (next === current) return current;
    current = next;
  }
  return undefined;
}

export function boundCampaignValue(value: string): string {
  const decoded = percentDecoded(value);
  return decoded === undefined || EMAIL.test(decoded)
    ? "[redacted]"
    : value.slice(0, MAX_CAMPAIGN_LENGTH);
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

function parseFirstTouch(raw: string | null): StoredFirstTouch | undefined {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return isStoredFirstTouch(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readFirstTouch(storage: StorageLike): StoredFirstTouch | undefined {
  try {
    return parseFirstTouch(storage.getItem(FIRST_TOUCH_KEY));
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

export const FIRST_TOUCH_SENT_KEY = "vm_first_touch_sent";
const SENT_HOLD_MS = 500;

type LocksLike = {
  request: (name: string, callback: () => Promise<void>) => Promise<unknown>;
};

function notify(touch: StoredFirstTouch) {
  for (const listener of listeners) listener(touch);
}

function sendOnce({
  storage,
  locks,
  posthog,
  touch,
  send,
}: {
  storage: StorageLike;
  locks: LocksLike | undefined;
  posthog: PosthogLike;
  touch: StoredFirstTouch;
  send: () => void;
}): Promise<void> {
  let sent = false;
  const sendNow = () => {
    if (sent) return;
    sent = true;
    send();
  };
  if (!locks) {
    sendNow();
    return Promise.resolve();
  }
  const underLock = async () => {
    const earlier = parseFirstTouch(storage.getItem(FIRST_TOUCH_SENT_KEY));
    if (earlier) {
      storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(earlier));
      registerFirstTouch(posthog, earlier);
      notify(earlier);
      return;
    }
    const record = JSON.stringify(touch);
    storage.setItem(FIRST_TOUCH_SENT_KEY, record);
    storage.setItem(FIRST_TOUCH_KEY, record);
    sendNow();
    await new Promise((resolve) => setTimeout(resolve, SENT_HOLD_MS));
  };
  try {
    return locks.request(FIRST_TOUCH_SENT_KEY, underLock).then(
      () => undefined,
      sendNow,
    );
  } catch {
    sendNow();
    return Promise.resolve();
  }
}

export function recordFirstTouch({
  posthog,
  storage,
  locks,
  surface,
  url,
  referrer,
  returning,
}: {
  posthog: PosthogLike;
  storage: StorageLike;
  locks?: LocksLike;
  surface: Surface;
  url: string;
  referrer: string;
  returning: boolean;
}): { touch?: StoredFirstTouch; sent: Promise<void> } {
  const stored = readFirstTouch(storage);
  if (stored) {
    registerFirstTouch(posthog, stored);
    notify(stored);
    return { touch: stored, sent: Promise.resolve() };
  }
  const touch = classifyFirstTouch({ url, referrer });
  const next: StoredFirstTouch = {
    channel: touch.channel,
    ...(touch.ai_source ? { ai_source: touch.ai_source } : {}),
    at: new Date().toISOString(),
  };
  try {
    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(next));
  } catch {
    return { sent: Promise.resolve() };
  }
  registerFirstTouch(posthog, next);
  notify(next);
  const sent = sendOnce({
    storage,
    locks,
    posthog,
    touch: next,
    send: () =>
      posthog.capture("acquisition_first_touch", { ...touch, surface, returning }),
  });
  return { touch: next, sent };
}

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const KEY = "phc_test";
const STORE = `ph_${KEY}_posthog`;
const EMAIL_URL =
  "https://versemate.org/?utm_source=nt44&utm_content=jane%2540example.com&email=jane%40example.com&token=t-secret#access_token=t-hash";
const SCRUBBED_URL = "https://versemate.org/?utm_source=nt44&utm_content=%5Bredacted%5D";
const LEAKS = /jane|t-secret|t-hash|\?u=/;
const RAW_INFO = { r: "https://mail.example.com/inbox?u=jane@example.com", u: EMAIL_URL };

type Sent = { url: string; body: Record<string, unknown> };

const saved = new Map<string, PropertyDescriptor | undefined>();
const savedKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const GLOBALS = ["window", "document", "location", "navigator", "localStorage", "sessionStorage", "screen", "fetch"];

type Visit = { seeded?: Record<string, unknown>; cookieOnly?: boolean; referrer?: string };

function browser(href: string, { seeded, cookieOnly = false, referrer = "" }: Visit) {
  const storage = new Map<string, string>();
  const session = new Map<string, string>();
  const cookies = new Map<string, string>();
  if (seeded) {
    if (!cookieOnly) storage.set(STORE, JSON.stringify(seeded));
    cookies.set(STORE, encodeURIComponent(JSON.stringify(seeded)));
  }
  const sent: Sent[] = [];
  const url = new URL(href);
  const store = (map: Map<string, string>) => ({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  });
  const location = {
    href,
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
  const document = {
    URL: href,
    referrer,
    readyState: "complete",
    location,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ setAttribute() {}, style: {} }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    documentElement: { scrollTop: 0, scrollHeight: 900, clientHeight: 900 },
    head: { appendChild() {} },
    body: { appendChild() {} },
    get cookie() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair, ...attrs] = raw.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      if (attrs.some((a) => /max-age=0|expires=Thu, 01 Jan 1970/i.test(a))) cookies.delete(name);
      else cookies.set(name, pair.slice(at + 1));
    },
  };
  const fetch = async (target: string, init?: { body?: unknown }) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.startsWith("data=")) {
      sent.push({ url: String(target), body: JSON.parse(atob(decodeURIComponent(body.slice(5)))) });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const win = {
    location,
    document,
    navigator: {
      userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      language: "en-US",
      vendor: "Google Inc.",
    },
    localStorage: store(storage),
    sessionStorage: store(session),
    screen: { width: 1440, height: 900 },
    fetch,
    addEventListener() {},
    removeEventListener() {},
  };
  return { win, sent, cookies, storage };
}

function install(win: Record<string, unknown>) {
  const target = globalThis as Record<string, unknown>;
  for (const name of GLOBALS) {
    Object.defineProperty(globalThis, name, {
      value: name === "window" ? globalThis : win[name],
      configurable: true,
      writable: true,
    });
  }
  target.addEventListener ??= () => {};
}

let generation = 0;

async function visit(href: string, options: Visit = {}) {
  const page = browser(href, options);
  install(page.win);
  process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
  generation += 1;
  const analytics = await import(`../lib/analytics/posthog?flags=${generation}`);
  const sdk = await import(`posthog-js/dist/main.js?flags=${generation}`);
  const posthog = sdk.default ?? sdk.posthog;
  await analytics.startAnalytics(page.win as unknown as Window, async () => posthog);
  posthog.set_config({ advanced_disable_feature_flags: false });
  posthog.reloadFeatureFlags();
  for (let waited = 0; waited < 2000 && !page.sent.some((s) => s.url.includes("/flags") && !s.body.disable_flags); waited += 10) {
    await Bun.sleep(10);
  }
  const flags = page.sent.filter((s) => s.url.includes("/flags"));
  return { ...page, flags };
}

function personProperties(flags: Sent[]) {
  return flags.map((f) => f.body.person_properties as Record<string, unknown>);
}

describe("what PostHog's /flags request and cookie carry from the landing page", () => {
  beforeAll(() => {
    for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  });
  afterAll(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = savedKey;
  });

  it("keeps the landing query, hash and referrer query out of every /flags call on the first visit", async () => {
    const { flags, cookies } = await visit(EMAIL_URL, { referrer: RAW_INFO.r });

    expect(flags.some((f) => f.body.disable_flags)).toBe(true);
    expect(flags.some((f) => !f.body.disable_flags)).toBe(true);
    for (const props of personProperties(flags)) {
      expect(JSON.stringify(props)).not.toMatch(LEAKS);
      expect(props.$initial_utm_source).toBe("nt44");
      expect(props.$initial_utm_content).toBe("[redacted]");
      expect(props.$initial_current_url).toBe(SCRUBBED_URL);
      expect(props.$initial_referrer).toBe("https://mail.example.com/inbox");
    }
    expect(decodeURIComponent(cookies.get(STORE) ?? "")).toContain("$initial_person_info");
    expect(decodeURIComponent(decodeURIComponent(cookies.get(STORE) ?? ""))).not.toMatch(LEAKS);
  });

  it("cleans a raw landing URL an earlier visit stored before the first /flags call", async () => {
    const { flags, cookies, storage } = await visit("https://versemate.org/give/", {
      seeded: { distinct_id: "d-1", $initial_person_info: RAW_INFO },
    });

    expect(flags.length).toBeGreaterThan(0);
    for (const props of personProperties(flags)) {
      expect(JSON.stringify(props)).not.toMatch(LEAKS);
      expect(props.$initial_referrer).toBe("https://mail.example.com/inbox");
      expect(props.$initial_utm_content).toBe("[redacted]");
    }
    expect(decodeURIComponent(decodeURIComponent(cookies.get(STORE) ?? ""))).not.toMatch(LEAKS);
    expect(JSON.parse(storage.get(STORE) ?? "{}").$initial_person_info).toEqual({
      r: "https://mail.example.com/inbox",
      u: SCRUBBED_URL,
    });
  });

  it("reduces a reader landing read from the shared cookie to its origin and campaign", async () => {
    const { flags, storage } = await visit("https://versemate.org/give/", {
      cookieOnly: true,
      seeded: {
        distinct_id: "d-3",
        $initial_person_info: {
          r: "https://docs.google.com/document/d/DOC-ID/edit",
          u: "https://app.versemate.org/coach/leader/l-77?utm_source=nt44&utm_content=jane%2540example.com",
        },
      },
    });

    expect(flags.length).toBeGreaterThan(0);
    for (const props of personProperties(flags)) {
      expect(JSON.stringify(props)).not.toMatch(/jane|l-77|DOC-ID/);
      expect(props.$initial_utm_source).toBe("nt44");
    }
    expect(JSON.parse(storage.get(STORE) ?? "{}").$initial_person_info).toEqual({
      r: "https://docs.google.com",
      u: "https://app.versemate.org?utm_source=nt44&utm_content=%5Bredacted%5D",
    });
  });

  it("replaces a stored record that is not the SDK's shape with the current page's", async () => {
    const { flags } = await visit("https://versemate.org/give/?email=jane%40example.com", {
      seeded: { distinct_id: "d-4", $initial_person_info: { r: null, u: 42 } },
    });

    expect(flags.length).toBeGreaterThan(0);
    for (const props of personProperties(flags)) {
      expect(JSON.stringify(props)).not.toMatch(LEAKS);
      expect(props.$initial_current_url).toBeUndefined();
    }
  });

  it("cleans the older stored campaign and referrer records in place", async () => {
    const { flags } = await visit("https://versemate.org/coach/", {
      seeded: {
        distinct_id: "d-2",
        $initial_campaign_params: { utm_source: "nt44", utm_content: "jane%40example.com" },
        $initial_referrer_info: { $referrer: RAW_INFO.r, $referring_domain: "mail.example.com" },
      },
    });

    expect(flags.length).toBeGreaterThan(0);
    for (const props of personProperties(flags)) {
      expect(JSON.stringify(props)).not.toMatch(LEAKS);
      expect(props.$initial_utm_source).toBe("nt44");
      expect(props.$initial_referrer).toBe("https://mail.example.com/inbox");
    }
  });
});

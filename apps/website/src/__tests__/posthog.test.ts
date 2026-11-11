import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { scrubEvent } from "../lib/analytics/privacy";

const KEY = "phc_test";

type Call = { method: string; args: unknown[] };

function fakeWindow({
  url = "https://versemate.org/coach/?utm_source=chatgpt.com",
  referrer = "",
  storage = new Map<string, string>(),
  refuseStorage = false,
  refuseCookies = false,
} = {}) {
  const cookies = new Map<string, string>();
  return {
    storage,
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (refuseStorage) throw new Error("blocked");
        storage.set(k, v);
      },
      removeItem: (k: string) => void storage.delete(k),
    },
    location: { href: url },
    document: {
      referrer,
      get cookie() {
        return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      },
      set cookie(raw: string) {
        if (refuseCookies) return;
        const [pair, ...attrs] = raw.split(";");
        const [name, value] = pair.split("=");
        if (attrs.some((a) => a.trim() === "max-age=0")) cookies.delete(name);
        else cookies.set(name, value);
      },
    },
  };
}

function fakePosthog(win: ReturnType<typeof fakeWindow>) {
  const calls: Call[] = [];
  const configs: Record<string, any>[] = [];
  const client = {
    calls,
    configs,
    register: (...args: unknown[]) => void calls.push({ method: "register", args }),
    capture: (...args: unknown[]) => void calls.push({ method: "capture", args }),
    init: (key: string, config: Record<string, any>) => {
      configs.push(config);
      win.localStorage.setItem(`ph_${key}_posthog`, "{}");
      config.loaded(client);
    },
  };
  return client;
}

let instance = 0;

async function start(win: ReturnType<typeof fakeWindow>) {
  instance += 1;
  const module = await import(`../lib/analytics/posthog?instance=${instance}`);
  const posthog = fakePosthog(win);
  let loads = 0;
  await module.startAnalytics(win as unknown as Window, async () => {
    loads += 1;
    return posthog as never;
  });
  return { posthog, loads, trackStoreLink: module.trackStoreLink };
}

describe("starting analytics on the website", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it("loads nothing without a key", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "";
    const { loads } = await start(fakeWindow());
    expect(loads).toBe(0);
  });

  it("loads nothing when the browser refuses storage", async () => {
    expect((await start(fakeWindow({ refuseStorage: true }))).loads).toBe(0);
  });

  it("loads nothing when the browser refuses cookies", async () => {
    expect((await start(fakeWindow({ refuseCookies: true }))).loads).toBe(0);
  });

  it("starts with the privacy limits on", async () => {
    const { posthog } = await start(fakeWindow());
    const config = posthog.configs[0];
    expect(config.before_send).toBe(scrubEvent);
    expect(config.disable_session_recording).toBe(true);
    expect(config.capture_pageview).toBe(false);
    expect(config.mask_personal_data_properties).toBe(true);
    expect(config.custom_personal_data_properties).toEqual([
      "accessToken",
      "refreshToken",
      "state",
      "s",
    ]);
    expect(config.disable_surveys).toBe(true);
    expect(config.advanced_disable_feature_flags).toBe(true);
  });

  it("names the surface, records the first touch, then sends the first page view carrying its channel", async () => {
    const { posthog } = await start(fakeWindow());
    const order = posthog.calls.map((c) =>
      c.method === "capture" ? `capture:${c.args[0]}` : `register:${Object.keys(c.args[0] as object)}`,
    );
    expect(order).toEqual([
      "register:surface,platform",
      "register:first_touch_channel,first_touch_ai_source",
      "capture:acquisition_first_touch",
      "capture:$pageview",
    ]);
    expect(posthog.calls[2].args[1]).toMatchObject({ surface: "website", channel: "ai", returning: false });
  });

  it("classifies the landing page even when the visitor moves on before PostHog loads", async () => {
    instance += 1;
    const module = await import(`../lib/analytics/posthog?instance=${instance}`);
    const win = fakeWindow({ url: "https://versemate.org/coach/?utm_source=newsletter", referrer: "" });
    const posthog = fakePosthog(win);
    await module.startAnalytics(win as unknown as Window, async () => {
      win.location.href = "https://versemate.org/download-app/";
      return posthog as never;
    });
    const touch = posthog.calls.find((c) => c.args[0] === "acquisition_first_touch");
    expect(touch?.args[1]).toMatchObject({ channel: "campaign", landing_path: "/coach/", utm_source: "newsletter" });
    const pageview = posthog.calls.find((c) => c.args[0] === "$pageview");
    expect(pageview?.args[1]).toEqual({
      $current_url: "https://versemate.org/coach/?utm_source=newsletter",
      $pathname: "/coach/",
    });
  });

  it("marks a browser that held PostHog state before as returning", async () => {
    const win = fakeWindow({ storage: new Map([[`ph_${KEY}_posthog`, "{}"]]) });
    const { posthog } = await start(win);
    const touch = posthog.calls.find((c) => c.args[0] === "acquisition_first_touch");
    expect(touch?.args[1]).toMatchObject({ returning: true });
  });

  it("sends a store click at once with the stored channel", async () => {
    const win = fakeWindow();
    const { posthog, trackStoreLink } = await start(win);
    trackStoreLink("app_store", "download-app");
    expect(posthog.calls.at(-1)?.args).toEqual([
      "store_link_clicked",
      { store: "app_store", page: "download-app", first_touch_channel: "ai" },
      { send_instantly: true },
    ]);
  });
});

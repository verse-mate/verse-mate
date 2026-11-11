import { describe, expect, it } from "bun:test";
import {
  classifyFirstTouch,
  readFirstTouch,
  recordFirstTouch,
} from "../lib/analytics/first-touch";
import cases from "./first-touch-cases.json";

type Case = {
  name: string;
  url: string;
  referrer: string;
  expect: Record<string, string>;
};

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

function fakePosthog() {
  const captured: { event: string; props: Record<string, unknown> }[] = [];
  const registered: Record<string, unknown>[] = [];
  return {
    captured,
    registered,
    capture: (event: string, props: Record<string, unknown>) =>
      void captured.push({ event, props }),
    register: (props: Record<string, unknown>) => void registered.push(props),
  };
}

function tabStorage(shared: ReturnType<typeof memoryStorage>) {
  const pending = new Map<string, string>();
  return {
    getItem: (k: string) => pending.get(k) ?? shared.getItem(k),
    setItem: (k: string, v: string) => {
      pending.set(k, v);
      setTimeout(() => {
        shared.setItem(k, v);
        if (pending.get(k) === v) pending.delete(k);
      }, 10);
    },
    removeItem: (k: string) => shared.removeItem(k),
  };
}

function serialLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: (_name: string, callback: () => Promise<void>) => {
      const run = tail.then(callback);
      tail = run.catch(() => {});
      return run;
    },
  };
}

describe("classifyFirstTouch", () => {
  for (const c of cases as unknown as Case[]) {
    it(c.name, () => {
      const touch = classifyFirstTouch({ url: c.url, referrer: c.referrer });
      for (const [key, value] of Object.entries(c.expect)) {
        expect(touch[key as keyof typeof touch]).toBe(value);
      }
      if (c.expect.channel !== "ai") expect(touch.ai_source).toBeUndefined();
    });
  }

  it("records no query parameter beyond the five UTMs and no referrer path", () => {
    const touch = classifyFirstTouch({
      url: "https://versemate.org/?utm_content=jane%40example.com&ref=abc&gclid=x",
      referrer: "https://www.reddit.com/r/Bible/comments/xyz/?s=1",
    });
    expect(JSON.stringify(touch)).not.toContain("abc");
    expect(JSON.stringify(touch)).not.toContain("gclid");
    expect(JSON.stringify(touch)).not.toContain("/r/Bible");
  });

  it("cuts a long campaign value to 100 characters", () => {
    const touch = classifyFirstTouch({
      url: `https://versemate.org/?utm_campaign=${"a".repeat(150)}`,
      referrer: "",
    });
    expect(touch.utm_campaign).toBe("a".repeat(100));
  });
});

describe("recordFirstTouch", () => {
  const visit = {
    surface: "website" as const,
    url: "https://versemate.org/coach/?utm_source=newsletter&utm_medium=email&utm_campaign=nov-launch",
    referrer: "",
  };

  it("records once per browser and registers the channel on every load", () => {
    const storage = memoryStorage();
    const first = fakePosthog();
    recordFirstTouch({ ...visit, posthog: first, storage, returning: false });
    const second = fakePosthog();
    recordFirstTouch({
      ...visit,
      url: "https://versemate.org/",
      referrer: "https://www.google.com/",
      posthog: second,
      storage,
      returning: true,
    });

    expect(first.captured).toHaveLength(1);
    expect(first.captured[0].event).toBe("acquisition_first_touch");
    expect(first.captured[0].props).toMatchObject({
      surface: "website",
      channel: "campaign",
      landing_path: "/coach/",
      returning: false,
    });
    expect(second.captured).toHaveLength(0);
    expect(second.registered.at(-1)).toEqual({ first_touch_channel: "campaign" });
    expect(readFirstTouch(storage)?.channel).toBe("campaign");
  });

  it("ignores a stored record it did not write", () => {
    const storage = memoryStorage({ vm_first_touch: JSON.stringify({ channel: "<script>" }) });
    const posthog = fakePosthog();
    recordFirstTouch({ ...visit, posthog, storage, returning: false });
    expect(posthog.captured).toHaveLength(1);
    expect(readFirstTouch(storage)?.channel).toBe("campaign");
  });

  it("registers the AI source with the channel", () => {
    const posthog = fakePosthog();
    recordFirstTouch({
      ...visit,
      url: "https://versemate.org/download-app/?utm_source=chatgpt.com",
      posthog,
      storage: memoryStorage(),
      returning: false,
    });
    expect(posthog.registered.at(-1)).toEqual({
      first_touch_channel: "ai",
      first_touch_ai_source: "chatgpt",
    });
  });

  it("records nothing when storage refuses the write", () => {
    const posthog = fakePosthog();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    recordFirstTouch({ ...visit, posthog, storage, returning: false });
    expect(posthog.captured).toHaveLength(0);
    expect(posthog.registered).toHaveLength(0);
  });
  it("records one first touch when two tabs open on a first visit", async () => {
    const storage = memoryStorage();
    const locks = serialLocks();
    const storageA = tabStorage(storage);
    const storageB = tabStorage(storage);
    const tabA = fakePosthog();
    const tabB = fakePosthog();
    const a = recordFirstTouch({ ...visit, posthog: tabA, storage: storageA, locks, returning: false });
    const b = recordFirstTouch({
      ...visit,
      url: "https://versemate.org/",
      referrer: "https://www.google.com/",
      posthog: tabB,
      storage: storageB,
      locks,
      returning: false,
    });
    await Promise.all([a.sent, b.sent]);

    const events = [...tabA.captured, ...tabB.captured];
    expect(events).toHaveLength(1);
    expect(events[0].props.channel).toBe("campaign");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(readFirstTouch(storage)?.channel).toBe("campaign");
    expect(tabB.registered.at(-1)).toEqual({ first_touch_channel: "campaign" });
  });
});

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

describe("classifyFirstTouch", () => {
  for (const c of cases as Case[]) {
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

  it("marks a browser that already held analytics state as returning", () => {
    const posthog = fakePosthog();
    recordFirstTouch({ ...visit, posthog, storage: memoryStorage(), returning: true });
    expect(posthog.captured[0].props.returning).toBe(true);
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
});

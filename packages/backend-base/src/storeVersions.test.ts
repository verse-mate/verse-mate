import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  fetchIosStoreVersion,
  fetchPlayStoreVersion,
  liveStoreVersion,
  platformFrom,
  versionFromStoreName,
} from "./storeVersions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("platformFrom", () => {
  it("takes the platform the app names", () => {
    expect(platformFrom("ios", "okhttp/4.12.0")).toBe("ios");
    expect(platformFrom("android", null)).toBe("android");
  });

  it("reads it from the User-Agent of builds that do not name it", () => {
    expect(platformFrom(undefined, "okhttp/4.12.0")).toBe("android");
    expect(
      platformFrom(
        undefined,
        "VerseMate/115 CFNetwork/3826.500.111 Darwin/24.4.0",
      ),
    ).toBe("ios");
  });

  it("is null for anything else", () => {
    expect(
      platformFrom(undefined, "Mozilla/5.0 (X11; Linux x86_64)"),
    ).toBeNull();
    expect(platformFrom("web", undefined)).toBeNull();
  });
});

describe("versionFromStoreName", () => {
  it("reads the store's release names", () => {
    expect(versionFromStoreName("v1.6.0")).toBe("1.6.0");
    expect(versionFromStoreName("1.7.0")).toBe("1.7.0");
    expect(versionFromStoreName("1.7")).toBe("1.7.0");
  });

  it("rejects names that are not a version", () => {
    expect(versionFromStoreName("Holiday release")).toBeNull();
    expect(versionFromStoreName(undefined)).toBeNull();
  });
});

describe("fetchIosStoreVersion", () => {
  it("returns the live App Store version", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return json({ resultCount: 1, results: [{ version: "v1.5.0" }] });
    }) as unknown as typeof fetch;
    expect(await fetchIosStoreVersion(fake)).toBe("1.5.0");
    expect(urls[0]).toContain("bundleId=org.versemate.app");
  });

  it("is null when the app is not found", async () => {
    const fake = (async () =>
      json({ resultCount: 0, results: [] })) as unknown as typeof fetch;
    expect(await fetchIosStoreVersion(fake)).toBeNull();
  });
});

describe("fetchPlayStoreVersion", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccount = JSON.stringify({
    client_email: "reader@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });

  function play(releases: Array<{ status: string; name: string }>) {
    const calls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(
        `${init?.method ?? "GET"} ${url.replace(/^https:\/\/[^/]+/, "")}`,
      );
      if (url.startsWith("https://oauth2.googleapis.com/token"))
        return json({ access_token: "t" });
      if (init?.method === "POST") return json({ id: "edit1" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return json({ track: "production", releases });
    }) as unknown as typeof fetch;
    return { fake, calls };
  }

  it("returns the highest completed production release and deletes its edit", async () => {
    const { fake, calls } = play([
      { status: "completed", name: "v1.6.0" },
      { status: "inProgress", name: "v1.7.0" }, // staged rollout: not downloadable by everyone yet
    ]);
    expect(await fetchPlayStoreVersion(fake, serviceAccount)).toBe("1.6.0");
    expect(
      calls.some((c) => c.startsWith("DELETE ") && c.includes("/edits/edit1")),
    ).toBe(true);
  });

  it("is null without a service account", async () => {
    const { fake } = play([]);
    expect(await fetchPlayStoreVersion(fake, undefined)).toBeNull();
  });
});

describe("liveStoreVersion", () => {
  function memoryCache() {
    const store = new Map<string, { value: unknown; ttl: string }>();
    return {
      store,
      cache: {
        get: async (key: string) => (store.get(key)?.value as never) ?? null,
        set: async (key: string, value: object, ttl: string) => {
          store.set(key, { value, ttl });
          return "OK";
        },
      } as never,
    };
  }

  it("asks the store once and serves the cached answer after", async () => {
    let asked = 0;
    const fake = (async () => {
      asked++;
      return json({ results: [{ version: "1.7.0" }] });
    }) as unknown as typeof fetch;
    const { cache, store } = memoryCache();
    expect(await liveStoreVersion("ios", cache, fake)).toBe("1.7.0");
    expect(await liveStoreVersion("ios", cache, fake)).toBe("1.7.0");
    expect(asked).toBe(1);
    expect(store.get("store_live_version:ios")?.ttl).toBe("1h");
  });

  it("caches a failed lookup briefly", async () => {
    const fake = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const { cache, store } = memoryCache();
    expect(await liveStoreVersion("ios", cache, fake)).toBeNull();
    expect(store.get("store_live_version:ios")?.ttl).toBe("10m");
  });
});

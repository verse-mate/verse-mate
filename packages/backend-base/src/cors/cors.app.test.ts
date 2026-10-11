import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import biblePlugin from "../bible/bible.plugin";
import healthCheckPlugin from "../healthcheck/healthcheck.plugin";
import userPlugin from "../user/user.plugin";
import versionPolicyPlugin from "../versionPolicy.plugin";
import { createCorsPlugin } from "./cors.plugin";

const ALLOWED = "https://app.versemate.org";
const FOREIGN = "https://attacker.example";

const app = new Elysia()
  .get(
    "/raw",
    () =>
      new Response("raw", {
        headers: { "Cache-Control": "public, max-age=86400" },
      }),
  )
  .use(userPlugin)
  .use(biblePlugin)
  .use(healthCheckPlugin)
  .use(versionPolicyPlugin)
  .use(createCorsPlugin({ ENVIRONMENT: "production" }));

let baseUrl: string;

beforeAll(() => {
  app.listen(0);
  baseUrl = `http://localhost:${app.server?.port}`;
});

afterAll(async () => {
  await app.server?.stop(true);
});

function request(pathname: string, origin?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (origin) headers.set("origin", origin);
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
}

describe("CORS on the composed API over a real connection", () => {
  it("allows a listed origin on a successful response", async () => {
    const response = await request("/health", ALLOWED);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  describe("error responses from other plugins", () => {
    for (const [name, pathname, status] of [
      ["an unauthenticated request", "/user/me", 401],
      ["a request that fails validation", "/bible/book/abc/1", 422],
      ["an unknown route", "/no-such-route", 404],
    ] as const) {
      it(`keeps the origin header for a listed origin on ${name}`, async () => {
        const response = await request(pathname, ALLOWED);

        expect(response.status).toBe(status);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          ALLOWED,
        );
        expect(response.headers.get("vary")).toBe("Origin");
      });

      it(`does not allow a foreign origin on ${name}`, async () => {
        const response = await request(pathname, FOREIGN);

        expect(response.status).toBe(status);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      });

      it(`serves ${name} unchanged without an Origin`, async () => {
        const response = await request(pathname);

        expect(response.status).toBe(status);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(await response.text()).not.toBe("");
      });
    }
  });

  it("answers the preflight of an authenticated route without a token", async () => {
    const response = await request("/user/me", ALLOWED, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization",
    );
  });

  describe("cacheable responses vary by Origin", () => {
    for (const [name, origin] of [
      ["a listed origin", ALLOWED],
      ["a foreign origin", FOREIGN],
      ["no Origin", undefined],
    ] as const) {
      it(`on the version policy for ${name}`, async () => {
        const response = await request("/api/version-policy", origin);

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(
          "public, max-age=300",
        );
        expect(response.headers.get("vary")).toBe("Origin");
      });

      it(`on a handler that returns its own Response for ${name}`, async () => {
        const response = await request("/raw", origin);

        expect(await response.text()).toBe("raw");
        expect(response.headers.get("cache-control")).toBe(
          "public, max-age=86400",
        );
        expect(response.headers.get("vary")).toBe("Origin");
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin === ALLOWED ? ALLOWED : null,
        );
      });
    }
  });

  describe("request handling the framework upgrade touches", () => {
    it("treats a malformed auth cookie as signed out", async () => {
      const response = await request("/user/me", ALLOWED, {
        headers: { cookie: "auth=not-a-token" },
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    });

    it("routes a path with a trailing slash like the bare path", async () => {
      const bare = await request("/health");
      const slashed = await request("/health/");

      expect(slashed.status).toBe(bare.status);
      expect(await slashed.json()).toEqual(await bare.json());
    });

    it("keeps the JSON content type on an object response that sets headers", async () => {
      const response = await request("/api/version-policy");

      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    });
  });
});

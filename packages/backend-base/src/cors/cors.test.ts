import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { createCorsPlugin } from "./cors.plugin";

const PRODUCTION_ENV = { ENVIRONMENT: "production" };
const DEVELOPMENT_ENV = { ENVIRONMENT: "development" };

function buildApp(env: Record<string, string | undefined>) {
  return new Elysia()
    .get("/probe", () => ({ ok: true }))
    .post("/probe", () => ({ ok: true }))
    .use(createCorsPlugin(env));
}

function get(
  app: ReturnType<typeof buildApp>,
  headers: Record<string, string> = {},
) {
  return app.handle(new Request("http://localhost/probe", { headers }));
}

function preflight(app: ReturnType<typeof buildApp>, origin: string) {
  return app.handle(
    new Request("http://localhost/probe", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    }),
  );
}

describe("CORS policy", () => {
  describe("origins outside the allowlist", () => {
    const app = buildApp(PRODUCTION_ENV);

    for (const origin of [
      "https://attacker.example",
      "https://app.versemate.org.attacker.example",
      "https://attacker-app.versemate.org",
      "http://app.versemate.org",
      "https://verse-mate.workers.dev.attacker.example",
      "https://preview.attacker.workers.dev",
      "https://unrelated-worker.verse-mate.workers.dev",
      "https://a.verse-mate-web-preview.verse-mate.workers.dev",
      "https://verse-mate-web-preview.verse-mate.workers.dev.attacker.example",
      "https://APP.VERSEMATE.ORG",
      "https://app.versemate.org:443",
      "https://app.versemate.org/",
      "null",
    ]) {
      it(`does not allow ${origin} on a simple request`, async () => {
        const response = await get(app, { origin });

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      });

      it(`does not allow ${origin} on a preflight`, async () => {
        const response = await preflight(app, origin);

        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      });
    }

    it("does not allow localhost outside development", async () => {
      const response = await get(app, { origin: "http://localhost:3000" });

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("origins in the allowlist", () => {
    const app = buildApp(PRODUCTION_ENV);

    for (const origin of [
      "https://app.versemate.org",
      "https://admin.versemate.org",
      "https://staging.app.verse-mate.xyz",
      "https://versemate.org",
      "https://www.versemate.org",
      "https://verse-mate.xyz",
      "https://www.verse-mate.xyz",
      "https://verse-mate-web-preview.verse-mate.workers.dev",
      "https://3f2a9c1d-verse-mate-web-preview.verse-mate.workers.dev",
      "https://verse-mate-web-staging.verse-mate.workers.dev",
      "https://v-m-preview-app.verse-mate.workers.dev",
      "https://feature-x-v-m-preview.verse-mate.workers.dev",
      "https://pr-12-verse-mate-website-preview.verse-mate.workers.dev",
    ]) {
      it(`allows ${origin} with credentials`, async () => {
        const response = await get(app, { origin });

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
        expect(response.headers.get("access-control-allow-credentials")).toBe(
          "true",
        );
        expect(response.headers.get("vary")).toBe("Origin");
      });

      it(`answers the preflight for ${origin}`, async () => {
        const response = await preflight(app, origin);

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
        expect(response.headers.get("access-control-allow-methods")).toBe(
          "POST",
        );
        expect(response.headers.get("access-control-allow-headers")).toBe(
          "authorization, content-type",
        );
        expect(response.headers.get("access-control-max-age")).toBe("600");
      });
    }
  });

  describe("local development", () => {
    const app = buildApp(DEVELOPMENT_ENV);

    for (const origin of [
      "http://localhost:3000",
      "http://localhost:8080",
      "http://127.0.0.1:5173",
    ]) {
      it(`allows ${origin}`, async () => {
        const response = await get(app, { origin });

        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
      });
    }

    it("allows localhost when ENVIRONMENT is test", async () => {
      const testApp = buildApp({ ENVIRONMENT: "test" });
      const response = await get(testApp, { origin: "http://localhost:3000" });

      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:3000",
      );
    });

    for (const environment of [undefined, "staging", "Development"]) {
      it(`does not allow localhost when ENVIRONMENT is ${environment}`, async () => {
        const otherApp = buildApp({ ENVIRONMENT: environment });
        const response = await get(otherApp, {
          origin: "http://localhost:3000",
        });

        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      });
    }

    it("does not allow a lookalike localhost host", async () => {
      const response = await get(app, {
        origin: "http://localhost.attacker.example",
      });

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("CORS_ALLOWED_ORIGINS", () => {
    const app = buildApp({
      ...PRODUCTION_ENV,
      CORS_ALLOWED_ORIGINS:
        " https://portal.example.org , https://admin.example.org",
    });

    it("replaces the default list of exact origins", async () => {
      const configured = await get(app, {
        origin: "https://portal.example.org",
      });
      const replaced = await get(app, { origin: "https://app.versemate.org" });

      expect(configured.headers.get("access-control-allow-origin")).toBe(
        "https://portal.example.org",
      );
      expect(replaced.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("still allows the preview workers", async () => {
      const response = await get(app, {
        origin: "https://verse-mate-web-preview.verse-mate.workers.dev",
      });

      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://verse-mate-web-preview.verse-mate.workers.dev",
      );
    });

    for (const value of ["", " , ,"]) {
      it(`keeps the default list when the variable is "${value}"`, async () => {
        const emptyApp = buildApp({
          ...PRODUCTION_ENV,
          CORS_ALLOWED_ORIGINS: value,
        });
        const response = await get(emptyApp, {
          origin: "https://app.versemate.org",
        });

        expect(response.headers.get("access-control-allow-origin")).toBe(
          "https://app.versemate.org",
        );
      });
    }

    for (const value of [
      "https://portal.example.org/",
      "portal.example.org",
      "*",
      "https://portal.example.org/path",
    ]) {
      it(`refuses to start with the entry "${value}"`, () => {
        expect(() =>
          createCorsPlugin({ ...PRODUCTION_ENV, CORS_ALLOWED_ORIGINS: value }),
        ).toThrow("CORS_ALLOWED_ORIGINS");
      });
    }
  });

  describe("clients that send no Origin (the mobile app)", () => {
    const app = buildApp(PRODUCTION_ENV);

    it("serves GET requests unchanged", async () => {
      const response = await get(app, { authorization: "Bearer token" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("serves POST requests unchanged", async () => {
      const response = await app.handle(
        new Request("http://localhost/probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });
});

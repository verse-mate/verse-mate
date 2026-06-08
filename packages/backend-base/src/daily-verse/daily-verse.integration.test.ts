import { afterAll, describe, expect, it } from "bun:test";
import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import Backend from "./daily-verse.plugin";

/**
 * Integration coverage for the public verse-of-the-day endpoint. Runs against
 * the CI test database. Assertions are resilient to whether the curation pool
 * is seeded: a valid request returns either a verse payload or { empty: true }.
 * The validation (400) paths are deterministic regardless of data.
 */
describe("Daily Verse Plugin (integration)", () => {
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - Combined plugin types
  const testClient = getTestClient<typeof plugin>(plugin);

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  // Today (server-local) — mirrors the endpoint's own default/window.
  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  // The server returns `date` as a plain "YYYY-MM-DD" string, but the Eden
  // Treaty client auto-parses date-shaped strings into Date objects. Normalize
  // either form back to "YYYY-MM-DD" for comparison.
  const ymd = (d: unknown): string =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

  it("GET /bible/verse-of-the-day returns a verse or an empty payload", async () => {
    const { data, error } = await testClient.bible["verse-of-the-day"].get({
      query: { date: today, bible_version: "NASB1995" },
    });

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    if (!data) return;
    expect(typeof data.empty).toBe("boolean");
    if (data.empty) {
      expect(data.fallbackMessage).toBeTruthy();
      expect(ymd(data.date)).toBe(today);
    } else {
      expect(Array.isArray(data.verses)).toBe(true);
      expect(data.referenceText).toBeTruthy();
      expect(data.versionKey).toBeTruthy();
      expect(data.reference.bookId).toBeGreaterThan(0);
    }
  });

  it("defaults the date to today when omitted", async () => {
    const { data, error } = await testClient.bible["verse-of-the-day"].get({
      query: {},
    });
    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    if (data?.empty) expect(ymd(data.date)).toBe(today);
  });

  it("rejects a malformed date with 400 (D-32)", async () => {
    const { error } = await testClient.bible["verse-of-the-day"].get({
      query: { date: "06/08/2026" },
    });
    expect(error?.status).toBe(400);
  });

  it("rejects an out-of-window date with 400 (D-32)", async () => {
    const { error } = await testClient.bible["verse-of-the-day"].get({
      query: { date: "2020-01-01" },
    });
    expect(error?.status).toBe(400);
  });
});

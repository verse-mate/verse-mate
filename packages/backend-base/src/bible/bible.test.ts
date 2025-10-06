import { afterAll, describe, expect, it } from "bun:test";

import { getTestClient } from "../shared/test-client";
import Backend from "./bible.plugin";

describe("Bible Plugin - Static Endpoints", () => {
  const testClient = getTestClient<typeof Backend>(Backend);

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("GET /bible/books - returns book list", async () => {
    const { data, error } = await testClient.bible.books.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(data?.books).toBeDefined();
    expect(Array.isArray(data?.books)).toBe(true);
    expect(data?.books.length).toBeGreaterThan(0);
  });

  it("GET /bible/languages - returns available languages", async () => {
    const { data, error } = await testClient.bible.languages.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /bible/testaments - returns testament list", async () => {
    const { data, error } = await testClient.bible.testaments.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(data?.testaments).toBeDefined();
    expect(Array.isArray(data?.testaments)).toBe(true);
    expect(data?.testaments.length).toBeGreaterThan(0);
  });
});

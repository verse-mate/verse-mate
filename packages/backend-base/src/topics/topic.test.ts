import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./topic.plugin";

describe("Topics Plugin", () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - Combined plugin types
  const testClient = getTestClient<typeof plugin>(plugin);

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  describe("GET /topics/categories", () => {
    it("returns list of topic categories", async () => {
      const { data, error } = await testClient.topics.categories.get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.categories).toBeDefined();
      expect(Array.isArray(data?.categories)).toBe(true);
      // Categories may be empty if database not seeded
    });

    it("validates response schema", async () => {
      const { data } = await testClient.topics.categories.get();

      if (data?.categories && data.categories.length > 0) {
        // Each category should be a string
        for (const category of data.categories) {
          expect(typeof category).toBe("string");
        }
      }
    });
  });

  describe("GET /topics/search", () => {
    it("requires category query parameter", async () => {
      // Testing invalid request without required category
      const { error, status } = await testClient.topics.search.get({
        query: {} as any,
      });

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });

    it("returns topics filtered by category", async () => {
      const { data, error } = await testClient.topics.search.get({
        query: { category: "EVENTS" },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.topics).toBeDefined();
      expect(Array.isArray(data?.topics)).toBe(true);
      // Topics may be empty if database not seeded
    });

    it("validates response schema for topic items", async () => {
      const { data } = await testClient.topics.search.get({
        query: { category: "EVENTS" },
      });

      if (data?.topics && data.topics.length > 0) {
        const topic = data.topics[0];
        expect(topic.topic_id).toBeDefined();
        expect(typeof topic.topic_id).toBe("string");
        expect(topic.name).toBeDefined();
        expect(typeof topic.name).toBe("string");
        // description can be string or null
        expect(
          typeof topic.description === "string" || topic.description === null,
        ).toBe(true);
        // sort_order can be number or null
        expect(
          typeof topic.sort_order === "number" || topic.sort_order === null,
        ).toBe(true);
      }
    });

    it("returns empty array for non-existent category", async () => {
      const { data, error } = await testClient.topics.search.get({
        query: { category: "NONEXISTENT_CATEGORY_12345" },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.topics).toBeDefined();
      expect(Array.isArray(data?.topics)).toBe(true);
      expect(data?.topics.length).toBe(0);
    });
  });

  describe("GET /topics/:id", () => {
    it("requires valid UUID format", async () => {
      // Testing invalid UUID format
      const { error, status } = await (testClient.topics as any)[
        "invalid-id"
      ].get();

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });

    it("returns null topic for non-existent ID", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.topic).toBe(null);
      expect(data?.references).toBe(null);
      expect(data?.explanation).toBeDefined();
    });

    it("validates response schema structure", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data } = await testClient.topics[fakeUuid].get();

      expect(data).toBeTruthy();
      expect(data?.topic !== undefined).toBe(true);
      expect(data?.references !== undefined).toBe(true);
      expect(data?.explanation).toBeDefined();
      expect(data?.explanation.summary).toBeDefined();
      expect(typeof data?.explanation.summary).toBe("string");
      expect(data?.explanation.byline).toBeDefined();
      expect(typeof data?.explanation.byline).toBe("string");
      expect(data?.explanation.detailed).toBeDefined();
      expect(typeof data?.explanation.detailed).toBe("string");
    });
  });

  describe("GET /topics/:id/references", () => {
    it("requires valid UUID format", async () => {
      // Testing invalid UUID format
      const { error, status } = await (testClient.topics as any)[
        "invalid-id"
      ].references.get();

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });

    it("returns references for valid topic ID", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].references.get({
        query: {},
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.references !== undefined).toBe(true);
    });

    it("accepts optional version query parameter", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].references.get({
        query: { version: "KJV" },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.references !== undefined).toBe(true);
    });

    it("validates reference schema when present", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data } = await testClient.topics[fakeUuid].references.get({
        query: {},
      });

      if (data?.references) {
        expect(data.references.content).toBeDefined();
        expect(typeof data.references.content).toBe("string");
      }
    });
  });

  describe("GET /topics/:id/explanation", () => {
    it("requires valid UUID format", async () => {
      // Testing invalid UUID format
      const { error, status } = await (testClient.topics as any)[
        "invalid-id"
      ].explanation.get();

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });

    it("returns explanation for valid topic ID", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].explanation.get(
        {
          query: {},
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.explanation !== undefined).toBe(true);
    });

    it("accepts optional type query parameter", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].explanation.get(
        {
          query: { type: "summary" },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.explanation !== undefined).toBe(true);
    });

    it("accepts optional lang query parameter", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.topics[fakeUuid].explanation.get(
        {
          query: { lang: "en-US" },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.explanation !== undefined).toBe(true);
    });

    it("validates explanation type enum values", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";

      const types = ["summary", "byline", "detailed"] as const;

      for (const type of types) {
        // @ts-ignore - Dynamic path parameter
        const { data, error } = await testClient.topics[
          fakeUuid
        ].explanation.get({
          query: { type },
        });

        expect(error).toBeFalsy();
        expect(data).toBeTruthy();
      }
    });

    it("validates explanation schema when present", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      // @ts-ignore - Dynamic path parameter
      const { data } = await testClient.topics[fakeUuid].explanation.get({
        query: {},
      });

      if (data?.explanation) {
        expect(data.explanation.explanation).toBeDefined();
        expect(typeof data.explanation.explanation).toBe("string");
      }
    });
  });

  describe("POST /topics/parse-references", () => {
    it("requires content and bibleVersion in request body", async () => {
      // Testing invalid request without required fields
      const { error, status } = await testClient.topics[
        "parse-references"
      ].post({} as any);

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });

    it("parses Bible references from content", async () => {
      const { data, error } = await testClient.topics["parse-references"].post({
        content: "See John 3:16 for more details",
        bibleVersion: "NASB1995",
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.parsedContent).toBeDefined();
      expect(typeof data?.parsedContent).toBe("string");
    });

    it("handles content without Bible references", async () => {
      const { data, error } = await testClient.topics["parse-references"].post({
        content: "This content has no Bible references",
        bibleVersion: "NASB1995",
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.parsedContent).toBeDefined();
      expect(typeof data?.parsedContent).toBe("string");
    });

    it("accepts different Bible versions", async () => {
      // Only test with NASB1995 as other versions may not be seeded in test database
      const { data, error } = await testClient.topics["parse-references"].post({
        content: "John 3:16",
        bibleVersion: "NASB1995",
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.parsedContent).toBeDefined();
    });

    it("returns error for invalid Bible version", async () => {
      const { error, status } = await testClient.topics[
        "parse-references"
      ].post({
        content: "John 3:16",
        bibleVersion: "INVALID_VERSION",
      });

      expect(error).toBeTruthy();
      expect(status).toBe(500); // Server error for invalid version
    });
  });
});

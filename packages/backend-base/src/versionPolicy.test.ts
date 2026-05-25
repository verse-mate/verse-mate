import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getTestClient } from "./shared/test-client";
import Backend, { type VersionPolicyPlugin } from "./versionPolicy.plugin";

const VERSION_POLICY_KEY = "version_policy";

describe("VersionPolicy", () => {
  const client = getTestClient<VersionPolicyPlugin>(Backend);
  const cache = Backend.store.cache;

  beforeAll(async () => {
    await cache.delete(VERSION_POLICY_KEY);
  });

  afterAll(async () => {
    await cache.delete(VERSION_POLICY_KEY);
  });

  describe("GET /api/version-policy", () => {
    it("returns default 0.0.0 values when no policy is set", async () => {
      const { data, error } = await client.api["version-policy"].get();
      expect(error).toBeNull();
      expect(data).toEqual({
        minVersion: "0.0.0",
        version: "0.0.0",
        releaseNotes: "",
      });
    });

    it("returns stored policy after POST sets it", async () => {
      await cache.setPersistent(VERSION_POLICY_KEY, {
        minVersion: "3.5.0",
        version: "3.6.1",
        releaseNotes: "Bug fixes",
      });

      const { data, error } = await client.api["version-policy"].get();
      expect(error).toBeNull();
      expect(data).toEqual({
        minVersion: "3.5.0",
        version: "3.6.1",
        releaseNotes: "Bug fixes",
      });

      await cache.delete(VERSION_POLICY_KEY);
    });
  });

  describe("POST /api/version-policy", () => {
    const validKey = "test-admin-key";

    beforeAll(() => {
      process.env.ADMIN_API_KEY = validKey;
    });

    afterAll(() => {
      process.env.ADMIN_API_KEY = undefined;
    });

    it("stores policy and returns it with valid key", async () => {
      const body = {
        minVersion: "3.6.1",
        version: "3.6.1",
        releaseNotes: "Bug fixes",
      };

      const { data, error } = await client.api["version-policy"].post(body, {
        headers: { "x-api-key": validKey },
      });

      expect(error).toBeNull();
      expect(data).toEqual(body);

      // verify GET reflects the change
      const { data: getResult } = await client.api["version-policy"].get();
      expect(getResult).toEqual(body);
    });

    it("returns 401 when X-Api-Key header is missing", async () => {
      const { error } = await client.api["version-policy"].post({
        minVersion: "1.0.0",
        version: "1.0.0",
        releaseNotes: "",
      });

      expect((error as any)?.status).toBe(401);
      expect((error as any)?.value?.error).toBe("UNAUTHORIZED");
    });

    it("returns 401 when X-Api-Key is wrong", async () => {
      const { error } = await client.api["version-policy"].post(
        { minVersion: "1.0.0", version: "1.0.0", releaseNotes: "" },
        { headers: { "x-api-key": "wrong-key" } },
      );

      expect((error as any)?.status).toBe(401);
    });

    it("returns 422 when minVersion is not valid semver", async () => {
      const { error } = await client.api["version-policy"].post(
        { minVersion: "latest", version: "3.6.1", releaseNotes: "" },
        { headers: { "x-api-key": validKey } },
      );

      expect((error as any)?.status).toBe(422);
      expect((error as any)?.value?.error).toBe("UNPROCESSABLE_ENTITY");
    });

    it("returns 422 when version is not valid semver", async () => {
      const { error } = await client.api["version-policy"].post(
        { minVersion: "3.6.1", version: "3.x", releaseNotes: "" },
        { headers: { "x-api-key": validKey } },
      );

      expect((error as any)?.status).toBe(422);
      expect((error as any)?.value?.error).toBe("UNPROCESSABLE_ENTITY");
    });

    it("returns 422 when minVersion > version", async () => {
      const { error } = await client.api["version-policy"].post(
        { minVersion: "4.0.0", version: "3.6.1", releaseNotes: "" },
        { headers: { "x-api-key": validKey } },
      );

      expect((error as any)?.status).toBe(422);
      expect((error as any)?.value?.error).toBe("UNPROCESSABLE_ENTITY");
      expect((error as any)?.value?.message).toBe(
        "minVersion must be ≤ version",
      );
    });

    it("accepts minVersion equal to version", async () => {
      const body = { minVersion: "3.6.1", version: "3.6.1", releaseNotes: "" };
      const { data, error } = await client.api["version-policy"].post(body, {
        headers: { "x-api-key": validKey },
      });

      expect(error).toBeNull();
      expect(data).toEqual(body);
    });

    it("accepts minVersion < version", async () => {
      const body = {
        minVersion: "3.5.0",
        version: "3.6.1",
        releaseNotes: "Improvements",
      };
      const { data, error } = await client.api["version-policy"].post(body, {
        headers: { "x-api-key": validKey },
      });

      expect(error).toBeNull();
      expect(data).toEqual(body);
    });
  });
});

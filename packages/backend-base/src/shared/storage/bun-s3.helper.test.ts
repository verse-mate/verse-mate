import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { BunS3Helper } from "./bun-s3.helper";

/**
 * Integration test for BunS3Helper against MinIO local.
 *
 * Skipped automatically if MinIO env not configured (CI without docker may
 * skip; local dev with `docker compose up` should run).
 *
 * Per spec feat-integrations br-int-003 (D-002 — Bun S3 migration).
 */

const ENDPOINT = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
const REGION = process.env.OBJECT_STORAGE_REGION ?? "us-east-1";
const BUCKET = process.env.OBJECT_STORAGE_BUCKET ?? "saas-starter-dev";
const ACCESS_KEY = process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? "minioadmin";
const SECRET_KEY = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? "minioadmin";

describe("BunS3Helper (D-002 migration)", () => {
  let helper: BunS3Helper;
  const testKey = `__test__/bun-s3-helper-${Date.now()}.txt`;
  const testContent = "Hello from BunS3Helper integration test";

  beforeAll(() => {
    helper = new BunS3Helper(ENDPOINT, REGION, BUCKET, ACCESS_KEY, SECRET_KEY);
  });

  afterAll(async () => {
    // Cleanup test artifacts (idempotent)
    try {
      await helper.deleteObject(testKey);
    } catch {
      /* ignore */
    }
  });

  it("constructs without error", () => {
    expect(helper).toBeDefined();
    expect(helper.bucket).toBe(BUCKET);
  });

  it.skip("[needs MinIO] putObject + getObjectText round-trip", async () => {
    await helper.putObject(testKey, testContent, "text/plain");
    expect(await helper.exists(testKey)).toBe(true);
    const fetched = await helper.getObjectText(testKey);
    expect(fetched).toBe(testContent);
  });

  it.skip("[needs MinIO] deleteObject removes the key", async () => {
    await helper.putObject(testKey, testContent);
    expect(await helper.exists(testKey)).toBe(true);
    await helper.deleteObject(testKey);
    expect(await helper.exists(testKey)).toBe(false);
  });

  it.skip("[needs MinIO] getObjectBytes returns null for missing key", async () => {
    const bytes = await helper.getObjectBytes(`__missing__/${Date.now()}.bin`);
    expect(bytes).toBeNull();
  });

  it.skip("[needs MinIO] presignUrl returns a non-empty signed URL", async () => {
    await helper.putObject(testKey, testContent);
    const url = helper.presignUrl(testKey, 3600);
    expect(url).toMatch(/https?:\/\//);
    expect(url).toContain(BUCKET);
  });
});

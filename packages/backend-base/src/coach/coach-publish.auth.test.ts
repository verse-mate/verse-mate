import { afterEach, describe, expect, it } from "bun:test";

import { bearerFrom, hasPublishScope } from "./coach-publish.auth";

const ORIGINAL = process.env.COACH_PUBLISH_TOKEN;
afterEach(() => {
  if (ORIGINAL === undefined)
    Reflect.deleteProperty(process.env, "COACH_PUBLISH_TOKEN");
  else process.env.COACH_PUBLISH_TOKEN = ORIGINAL;
});

describe("coach publish credential", () => {
  it("FAILS CLOSED when no token is configured (never allow-by-default)", () => {
    Reflect.deleteProperty(process.env, "COACH_PUBLISH_TOKEN");
    expect(hasPublishScope("Bearer anything")).toBe(false);
    process.env.COACH_PUBLISH_TOKEN = "   ";
    expect(hasPublishScope("Bearer anything")).toBe(false);
  });

  it("accepts only the exact configured token", () => {
    process.env.COACH_PUBLISH_TOKEN = "s3cret-publish";
    expect(hasPublishScope("Bearer s3cret-publish")).toBe(true);
    expect(hasPublishScope("Bearer s3cret-publis")).toBe(false);
    expect(hasPublishScope("Bearer s3cret-publish-extra")).toBe(false);
    expect(hasPublishScope("Bearer wrong")).toBe(false);
  });

  it("rejects a missing or malformed Authorization header", () => {
    process.env.COACH_PUBLISH_TOKEN = "s3cret-publish";
    expect(hasPublishScope(undefined)).toBe(false);
    expect(hasPublishScope("s3cret-publish")).toBe(false); // no Bearer scheme
    expect(hasPublishScope("Basic s3cret-publish")).toBe(false);
  });

  it("parses the bearer value case-insensitively", () => {
    expect(bearerFrom("bearer abc")).toBe("abc");
    expect(bearerFrom("Bearer  abc  ")).toBe("abc");
    expect(bearerFrom("")).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { adminApiKeyGuard } from "./admin-api-key";

const KEY = faker.string.alphanumeric(40);
const previous = process.env.ADMIN_API_KEY;

function check(key?: string) {
  const set: { status?: number } = {};
  const headers = key === undefined ? undefined : { "x-api-key": key };
  const result = adminApiKeyGuard({
    request: new Request("http://localhost/", { headers }),
    set: set as never,
  });
  return { result, status: set.status };
}

describe("adminApiKeyGuard", () => {
  beforeAll(() => {
    process.env.ADMIN_API_KEY = KEY;
  });

  afterAll(() => {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ADMIN_API_KEY");
    else process.env.ADMIN_API_KEY = previous;
  });

  it("lets the configured key through", () => {
    expect(check(KEY)).toEqual({ result: undefined, status: undefined });
  });

  it.each([
    ["no key", undefined],
    ["an empty key", ""],
    ["a wrong key of the same length", faker.string.alphanumeric(40)],
    ["a prefix of the key", KEY.slice(0, 20)],
    ["the key with a suffix", `${KEY}x`],
  ])("refuses %s", (_label, key) => {
    const { result, status } = check(key);
    expect(status).toBe(401);
    expect(result?.error).toBe("UNAUTHORIZED");
  });

  it("refuses every key when none is configured", () => {
    Reflect.deleteProperty(process.env, "ADMIN_API_KEY");
    try {
      expect(check("").status).toBe(401);
      expect(check(KEY).status).toBe(401);
    } finally {
      process.env.ADMIN_API_KEY = KEY;
    }
  });

  it("compares keys in constant time", () => {
    const compare = spyOn(crypto, "timingSafeEqual");
    try {
      check(faker.string.alphanumeric(40));
      check(KEY);
      expect(compare).toHaveBeenCalledTimes(2);
    } finally {
      compare.mockRestore();
    }
  });
});

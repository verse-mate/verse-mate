import { afterEach, describe, expect, it } from "bun:test";

import { firefliesApiKey, firefliesConfigured } from "./fireflies.config";

const ORIGINAL = process.env.FIREFLIES_API_KEY;

// Reflect.deleteProperty, not `delete`: biome bans the operator, and its
// suggested fix, assigning undefined, stores the STRING "undefined" in
// process.env, which would make "missing" tests pass for the wrong reason.
function unsetKey(): void {
  Reflect.deleteProperty(process.env, "FIREFLIES_API_KEY");
}

afterEach(() => {
  if (ORIGINAL === undefined) unsetKey();
  else process.env.FIREFLIES_API_KEY = ORIGINAL;
});

describe("the Fireflies credential is required, never defaulted", () => {
  it("reads the key when it is set", () => {
    process.env.FIREFLIES_API_KEY = "ff-test-key";
    expect(firefliesApiKey()).toBe("ff-test-key");
    expect(firefliesConfigured()).toBe(true);
  });

  it("fails loudly when it is missing, naming the variable", () => {
    unsetKey();
    expect(firefliesConfigured()).toBe(false);
    // Never a silent degrade to "no sessions today", an unset credential and
    // a genuinely quiet week are indistinguishable to a reader, and the quiet
    // week is the one that is fine.
    expect(() => firefliesApiKey()).toThrow(/FIREFLIES_API_KEY/);
  });

  it("treats blank and whitespace as missing, not as a key", () => {
    process.env.FIREFLIES_API_KEY = "   ";
    expect(firefliesConfigured()).toBe(false);
    expect(() => firefliesApiKey()).toThrow(/FIREFLIES_API_KEY/);
  });
});

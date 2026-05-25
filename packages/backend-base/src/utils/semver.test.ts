import { describe, expect, it } from "bun:test";
import { isGreaterThan, isGreaterThanOrEqual, validateSemver } from "./semver";

describe("validateSemver", () => {
  it("accepts valid versions", () => {
    expect(validateSemver("1.0.0")).toBe("1.0.0");
    expect(validateSemver("3.10.0")).toBe("3.10.0");
    expect(validateSemver("0.0.0")).toBe("0.0.0");
  });

  it("accepts pre-release versions", () => {
    expect(validateSemver("1.0.0-rc.1")).toBe("1.0.0-rc.1");
  });

  it("throws on non-semver strings", () => {
    expect(() => validateSemver("latest")).toThrow('Invalid semver: "latest"');
    expect(() => validateSemver("3.x")).toThrow('Invalid semver: "3.x"');
    expect(() => validateSemver("not-a-version")).toThrow();
  });
});

describe("isGreaterThan", () => {
  it("patch increment", () => {
    expect(isGreaterThan("1.0.1", "1.0.0")).toBe(true);
    expect(isGreaterThan("1.0.0", "1.0.1")).toBe(false);
  });

  it("minor increment", () => {
    expect(isGreaterThan("1.1.0", "1.0.0")).toBe(true);
  });

  it("handles 3.10.0 > 3.9.0 correctly (no string comparison)", () => {
    expect(isGreaterThan("3.10.0", "3.9.0")).toBe(true);
    expect(isGreaterThan("3.9.0", "3.10.0")).toBe(false);
  });

  it("equal versions are not greater", () => {
    expect(isGreaterThan("1.0.0", "1.0.0")).toBe(false);
  });

  it("1.0.0-rc.1 < 1.0.0 (pre-release is lower)", () => {
    expect(isGreaterThan("1.0.0", "1.0.0-rc.1")).toBe(true);
    expect(isGreaterThan("1.0.0-rc.1", "1.0.0")).toBe(false);
  });
});

describe("isGreaterThanOrEqual", () => {
  it("equal versions pass", () => {
    expect(isGreaterThanOrEqual("1.0.0", "1.0.0")).toBe(true);
  });

  it("greater version passes", () => {
    expect(isGreaterThanOrEqual("1.0.1", "1.0.0")).toBe(true);
  });

  it("lower version fails", () => {
    expect(isGreaterThanOrEqual("1.0.0", "1.0.1")).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import {
  canonicalizeLanguageCode,
  resolveLanguageCode,
} from "./resolve-language-code";

describe("resolveLanguageCode (D-013 alias)", () => {
  it("en-US → [en-US, en]", () => {
    expect(resolveLanguageCode("en-US")).toEqual(["en-US", "en"]);
  });

  it("en → [en, en-US]", () => {
    expect(resolveLanguageCode("en")).toEqual(["en", "en-US"]);
  });

  it("pt-BR → [pt-BR, pt]", () => {
    expect(resolveLanguageCode("pt-BR")).toEqual(["pt-BR", "pt"]);
  });

  it("pt → [pt, pt-BR]", () => {
    expect(resolveLanguageCode("pt")).toEqual(["pt", "pt-BR"]);
  });

  it("zh (no canonical region) → [zh]", () => {
    expect(resolveLanguageCode("zh")).toEqual(["zh"]);
  });

  it("rejects malformed input", () => {
    expect(() => resolveLanguageCode("english")).toThrow(/BCP-47/);
    expect(() => resolveLanguageCode("EN")).toThrow(/BCP-47/);
    expect(() => resolveLanguageCode("en_US")).toThrow(/BCP-47/);
    expect(() => resolveLanguageCode("")).toThrow(/BCP-47/);
  });

  it("most-specific form is first (lookup query benefits from natural IN ordering)", () => {
    const formsRegional = resolveLanguageCode("en-US");
    expect(formsRegional[0]).toBe("en-US"); // exact match preferred
    expect(formsRegional[1]).toBe("en"); // base fallback

    const formsBase = resolveLanguageCode("en");
    expect(formsBase[0]).toBe("en"); // exact match preferred
    expect(formsBase[1]).toBe("en-US"); // regional fallback
  });
});

describe("canonicalizeLanguageCode", () => {
  it("strips region", () => {
    expect(canonicalizeLanguageCode("en-US")).toBe("en");
    expect(canonicalizeLanguageCode("pt-BR")).toBe("pt");
    expect(canonicalizeLanguageCode("zh")).toBe("zh");
  });

  it("rejects malformed input", () => {
    expect(() => canonicalizeLanguageCode("ZH-CN")).toThrow(/BCP-47/);
  });
});

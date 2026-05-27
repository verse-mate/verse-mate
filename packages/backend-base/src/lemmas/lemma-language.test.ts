import { describe, expect, it } from "bun:test";
import {
  type LemmaProseValues,
  isLemmaFullyTranslated,
  normalizeLanguageCode,
} from "./lemma-language";

describe("normalizeLanguageCode", () => {
  it("passes through a bare base code", () => {
    expect(normalizeLanguageCode("es")).toBe("es");
    expect(normalizeLanguageCode("de")).toBe("de");
  });

  it("lowercases", () => {
    expect(normalizeLanguageCode("ES")).toBe("es");
    expect(normalizeLanguageCode("Pt")).toBe("pt");
  });

  it("strips a region suffix", () => {
    expect(normalizeLanguageCode("es-MX")).toBe("es");
    expect(normalizeLanguageCode("pt-BR")).toBe("pt");
    expect(normalizeLanguageCode("pt_BR")).toBe("pt");
    expect(normalizeLanguageCode("zh-Hans")).toBe("zh");
  });

  it("trims whitespace", () => {
    expect(normalizeLanguageCode("  fr  ")).toBe("fr");
  });

  it("keeps 3-letter codes (e.g. Filipino)", () => {
    expect(normalizeLanguageCode("fil")).toBe("fil");
  });

  it("collapses empty / null / garbage to en", () => {
    expect(normalizeLanguageCode("")).toBe("en");
    expect(normalizeLanguageCode(null)).toBe("en");
    expect(normalizeLanguageCode(undefined)).toBe("en");
    expect(normalizeLanguageCode("english")).toBe("en");
    expect(normalizeLanguageCode("123")).toBe("en");
  });

  it("neutralizes a SQL-injection attempt to en", () => {
    expect(normalizeLanguageCode("es'; DROP TABLE lemmas;--")).toBe("en");
  });

  it("normalizes en variants to en", () => {
    expect(normalizeLanguageCode("en")).toBe("en");
    expect(normalizeLanguageCode("en-US")).toBe("en");
  });
});

const base = (over: Partial<LemmaProseValues> = {}): LemmaProseValues => ({
  pos: "Noun",
  basic_gloss: "house",
  semantic_range: ["dwelling", "household"],
  notes: "A note.",
  related: [{ translit: "bayit", note: "related" }],
  ...over,
});

describe("isLemmaFullyTranslated", () => {
  it("true when every baseline prose field has a translation", () => {
    expect(
      isLemmaFullyTranslated(
        base(),
        base({
          pos: "Sustantivo",
          basic_gloss: "casa",
          semantic_range: ["morada"],
          notes: "Una nota.",
          related: [{ translit: "bayit", note: "relacionado" }],
        }),
      ),
    ).toBe(true);
  });

  it("false when a baseline field is left untranslated (English leakage)", () => {
    expect(
      isLemmaFullyTranslated(
        base(),
        base({
          pos: "Sustantivo",
          basic_gloss: "casa",
          semantic_range: null, // leaks English
          notes: "Una nota.",
          related: [{ translit: "bayit", note: "relacionado" }],
        }),
      ),
    ).toBe(false);
  });

  it("false when only basic_gloss is translated (old lenient policy)", () => {
    expect(
      isLemmaFullyTranslated(
        base(),
        base({
          pos: null,
          basic_gloss: "casa",
          semantic_range: null,
          notes: null,
          related: null,
        }),
      ),
    ).toBe(false);
  });

  it("does not require fields the baseline itself lacks", () => {
    expect(
      isLemmaFullyTranslated(
        base({ notes: null, related: null }),
        base({
          pos: "Sustantivo",
          basic_gloss: "casa",
          semantic_range: ["morada"],
          notes: null,
          related: null,
        }),
      ),
    ).toBe(true);
  });
});

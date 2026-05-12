import { describe, expect, it } from "bun:test";
import { withEnglishFallback } from "./with-fallback";

describe("withEnglishFallback (D-014)", () => {
  it("returns translated:true when user-language content exists", async () => {
    const result = await withEnglishFallback("pt-BR", async (lang) => {
      if (lang === "pt-BR") return { text: "Conteúdo em português" };
      return null;
    });

    expect(result).toEqual({
      content: { text: "Conteúdo em português" },
      translated: true,
      source_language: "pt",
    });
  });

  it("falls back to English with translated:false when user-language is missing", async () => {
    const result = await withEnglishFallback("pt-BR", async (lang) => {
      if (lang === "en") return { text: "English content" };
      return null;
    });

    expect(result).toEqual({
      content: { text: "English content" },
      translated: false,
      source_language: "en",
    });
  });

  it("returns null when both user-language AND English are missing", async () => {
    const result = await withEnglishFallback("pt-BR", async () => null);
    expect(result).toBeNull();
  });

  it("does NOT fall back when user IS English (translated:true)", async () => {
    const result = await withEnglishFallback("en", async (lang) => {
      if (lang === "en") return { text: "English" };
      return null;
    });

    expect(result?.translated).toBe(true);
    expect(result?.source_language).toBe("en");
  });

  it("does NOT fall back when user is en-US either (alias-aware)", async () => {
    const result = await withEnglishFallback("en-US", async () => null);
    expect(result).toBeNull(); // does NOT silently re-query English (would loop)
  });

  it("source_language is canonicalized (drops region)", async () => {
    const result = await withEnglishFallback("pt-BR", async () => ({
      text: "X",
    }));
    expect(result?.source_language).toBe("pt"); // canonical, not "pt-BR"
  });

  it("works with primitive content types", async () => {
    const result = await withEnglishFallback<string>("pt-BR", async (lang) =>
      lang === "pt-BR" ? "olá" : null,
    );
    expect(result?.content).toBe("olá");
    expect(result?.translated).toBe(true);
  });
});

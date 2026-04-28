/**
 * Unit tests for the OpenAI TTS chunker. The OpenAI audio.speech.create
 * endpoint rejects inputs > 4096 characters with a 400 string_too_long.
 * Detailed and By Line explanations regularly run 5000–10000 chars, so
 * a one-shot synth call fails for those tabs in production. Caught on
 * 2026-04-28 — Genesis 20 Detailed (explanation 10236) and others
 * surfaced repeated `string_too_long` failures in DO run logs.
 *
 * The chunker is exported separately from the provider so it can be
 * exercised without instantiating the OpenAI SDK or hitting the API.
 */
import { describe, expect, it } from "bun:test";
import { chunkForOpenAi } from "./openai-tts.provider";

describe("chunkForOpenAi", () => {
  it("returns the input unchanged when it fits", () => {
    const text = "In the beginning God created the heavens and the earth.";
    expect(chunkForOpenAi(text, 4000)).toEqual([text]);
  });

  it("splits at sentence boundaries when the input exceeds the limit", () => {
    const sentence = `${"A".repeat(100)}.`;
    const text = Array(50).fill(sentence).join(" "); // 5050 chars
    const chunks = chunkForOpenAi(text, 1000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000);
    }
    // No content lost: re-joining the chunks reconstructs the same
    // sentences (whitespace normalization aside).
    const rejoined = chunks.join(" ");
    expect(rejoined.replace(/\s+/g, " ").trim()).toBe(
      text.replace(/\s+/g, " ").trim(),
    );
  });

  it("respects newline boundaries (paragraph seams)", () => {
    const para = "B".repeat(900);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkForOpenAi(text, 1000);

    expect(chunks.length).toBe(3);
    for (const c of chunks) {
      expect(c.length).toBe(900);
    }
  });

  it("falls back to word boundaries when a single sentence is too long", () => {
    const longSentence = `${"word ".repeat(300).trim()}.`; // ~1500 chars, no `.` until end
    const chunks = chunkForOpenAi(longSentence, 500);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(500);
      // Each chunk should still be made of whole words.
      expect(c.startsWith(" ")).toBe(false);
      expect(c.endsWith(" ")).toBe(false);
    }
  });

  it("falls back to character slicing for a single oversize token", () => {
    const giantWord = "X".repeat(8000); // one token, no spaces
    const chunks = chunkForOpenAi(giantWord, 4000);

    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4000);
    expect(chunks[1].length).toBe(4000);
    expect(chunks.join("")).toBe(giantWord);
  });

  it("never produces an empty chunk", () => {
    const text = `Short.\n\n${"X".repeat(4500)}\n\nAnother sentence here.`;
    const chunks = chunkForOpenAi(text, 1000);

    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it("regression: 8000-char Detailed explanation gets split into ≤4000-char chunks", () => {
    // Approximates the size class of a Detailed explanation observed
    // failing in prod logs (genesis 20 / 10236 etc.).
    const sentence = "This is a moderately long sentence about scripture. ";
    const text = sentence.repeat(160); // ~8480 chars
    const chunks = chunkForOpenAi(text, 4000);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4000);
    }
  });
});

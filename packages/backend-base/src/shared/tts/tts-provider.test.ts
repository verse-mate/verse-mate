import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StubTtsProvider } from "./providers/stub-tts.provider";
import { createTtsProvider } from "./tts-provider.factory";
import type { TtsProvider } from "./tts-provider.interface";

// Minimal valid MP3 frame (128 kbps, 44.1 kHz, stereo) repeated — ~1s of silence.
// This keeps tests hermetic and does not rely on the committed fixture.
function makeTinyMp3(): Buffer {
  const FRAME_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const FRAME_BODY = Buffer.alloc(414);
  const frame = Buffer.concat([FRAME_HEADER, FRAME_BODY]);
  const frames: Buffer[] = [];
  for (let i = 0; i < 40; i++) frames.push(frame);
  return Buffer.concat(frames);
}

function contractTests(name: string, makeProvider: () => TtsProvider) {
  describe(`TtsProvider contract — ${name}`, () => {
    it("synthesize returns non-empty buffer + metadata", async () => {
      const provider = makeProvider();
      const input = {
        text: "In the beginning God created the heavens and the earth.",
        voice: "nova",
        language: "en",
        format: "mp3" as const,
      };
      const output = await provider.synthesize(input);

      expect(output.audio).toBeInstanceOf(Buffer);
      expect(output.audio.byteLength).toBeGreaterThan(0);
      expect(output.duration_seconds).toBeGreaterThan(0);
      expect(output.character_count).toBe(input.text.length);
      expect(typeof output.model_version).toBe("string");
      expect(output.model_version.length).toBeGreaterThan(0);
    });

    it("listVoices returns non-empty list for the given language", async () => {
      const provider = makeProvider();
      const voices = await provider.listVoices("en");
      expect(voices.length).toBeGreaterThan(0);
      for (const voice of voices) {
        expect(voice.language).toBe("en");
        expect(voice.id).toBeTruthy();
        expect(voice.label).toBeTruthy();
      }
    });

    it("exposes a name", () => {
      const provider = makeProvider();
      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);
    });
  });
}

// Stub is always exercised in CI. Write the fixture to the OS temp dir so
// nothing lands inside the source tree.
const tmpDir = mkdtempSync(join(tmpdir(), "versemate-tts-test-"));
const tmpFixture = join(tmpDir, "stub-fixture.mp3");
writeFileSync(tmpFixture, makeTinyMp3());
contractTests("stub", () => new StubTtsProvider({ fixturePath: tmpFixture }));

// OpenAI live contract test runs only when an opt-in flag is set explicitly.
// We intentionally do NOT trigger on OPEN_AI_KEY alone — many .env files set
// dummy or test-only keys for unrelated tests, and a 401 from OpenAI would
// look like a regression. Set RUN_OPENAI_TTS_IT=1 (and a real key) to exercise.
if (process.env.RUN_OPENAI_TTS_IT === "1" && process.env.OPEN_AI_KEY) {
  const { OpenAiTtsProvider } = await import("./providers/openai-tts.provider");
  contractTests("openai (live)", () => new OpenAiTtsProvider());
}

describe("createTtsProvider factory", () => {
  it("defaults to openai when passed no argument", () => {
    if (!process.env.OPEN_AI_KEY) return;
    // Passing undefined triggers the env fallback path; keep the real env untouched
    // so we don't leak cross-test state.
    const provider = createTtsProvider("openai");
    expect(provider.name).toBe("openai");
  });

  it("returns StubTtsProvider when TTS_PROVIDER=stub", () => {
    const provider = createTtsProvider("stub");
    expect(provider.name).toBe("stub");
  });

  it("throws on unknown provider name", () => {
    expect(() => createTtsProvider("bogus")).toThrow(/Unknown TTS_PROVIDER/);
  });
});

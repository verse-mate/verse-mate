import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { InternalServerError } from "../../../common/errors";
import type {
  SynthesizeInput,
  SynthesizeOutput,
  TtsProvider,
  Voice,
} from "../tts-provider.interface";

const DEFAULT_FIXTURE_PATH = "./fixtures/explanation-audio-stub.mp3";

export class StubTtsProvider implements TtsProvider {
  readonly name = "stub";
  private readonly fixturePath: string;
  private cachedAudio?: Buffer;
  private cachedDurationSeconds?: number;

  constructor(options?: { fixturePath?: string }) {
    this.fixturePath = resolve(
      options?.fixturePath ??
        process.env.EXPLANATION_AUDIO_STUB_PATH ??
        DEFAULT_FIXTURE_PATH,
    );
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const audio = this.loadFixture();
    return {
      audio,
      duration_seconds: this.cachedDurationSeconds ?? 0,
      character_count: input.text.length,
      model_version: "stub-fixture",
    };
  }

  async listVoices(language: string): Promise<Voice[]> {
    return [{ id: "stub", language, label: "Stub (fixture)" }];
  }

  private loadFixture(): Buffer {
    if (this.cachedAudio) return this.cachedAudio;

    try {
      const stats = statSync(this.fixturePath);
      if (!stats.isFile()) {
        throw new Error("not a regular file");
      }
      this.cachedAudio = readFileSync(this.fixturePath);
      this.cachedDurationSeconds = estimateMp3DurationSeconds(this.cachedAudio);
      return this.cachedAudio;
    } catch (error) {
      throw new InternalServerError(
        `StubTtsProvider: cannot read fixture at ${this.fixturePath} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function estimateMp3DurationSeconds(buffer: Buffer): number {
  // Approximation: 128 kbps MP3 → 16 KB/s. Good enough for stub UI testing.
  const kilobytes = buffer.byteLength / 1024;
  const seconds = kilobytes / 16;
  return Math.max(1, Math.round(seconds));
}

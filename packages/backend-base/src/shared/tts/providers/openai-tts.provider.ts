import OpenAI from "openai";
import { InternalServerError } from "../../../common/errors";
import type {
  SynthesizeInput,
  SynthesizeOutput,
  TtsProvider,
  Voice,
} from "../tts-provider.interface";

const DEFAULT_MODEL = "tts-1-hd";
const AVG_CHARS_PER_SECOND = 15;

/**
 * OpenAI's TTS API rejects inputs longer than 4096 characters with a
 * 400 `string_too_long`. Detailed (and many By Line) explanations
 * regularly run 5000–10000 chars, which means a one-shot call fails
 * for those tabs. Split slightly under the limit so trailing spaces
 * or any future tweak doesn't push us over.
 */
const OPENAI_TTS_CHAR_LIMIT = 4000;

const OPENAI_VOICES: Voice[] = [
  { id: "alloy", language: "en", label: "Alloy" },
  { id: "echo", language: "en", label: "Echo" },
  { id: "fable", language: "en", label: "Fable" },
  { id: "onyx", language: "en", label: "Onyx" },
  { id: "nova", language: "en", label: "Nova" },
  { id: "shimmer", language: "en", label: "Shimmer" },
];

export class OpenAiTtsProvider implements TtsProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPEN_AI_KEY;
    if (!apiKey) {
      throw new InternalServerError(
        "OpenAiTtsProvider: OPEN_AI_KEY is not set",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model =
      options?.model ?? process.env.TTS_MODEL_OPENAI ?? DEFAULT_MODEL;
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const chunks = chunkForOpenAi(input.text, OPENAI_TTS_CHAR_LIMIT);

    // MP3 is frame-based and naturally concatenable — joining the
    // buffers of each chunk's response produces a valid, playable MP3
    // for the whole text. There can be a barely-perceptible click at
    // the seam, which we accept for narration.
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      const response = await this.client.audio.speech.create({
        model: this.model,
        voice: input.voice as OpenAI.Audio.SpeechCreateParams["voice"],
        input: chunk,
        response_format: input.format,
      });
      const arrayBuffer = await response.arrayBuffer();
      audioBuffers.push(Buffer.from(arrayBuffer));
    }
    const audio = Buffer.concat(audioBuffers);

    return {
      audio,
      duration_seconds: estimateDurationSeconds(input.text),
      character_count: input.text.length,
      model_version: this.model,
    };
  }

  async listVoices(language: string): Promise<Voice[]> {
    return OPENAI_VOICES.filter((v) => v.language === language);
  }
}

function estimateDurationSeconds(text: string): number {
  // OpenAI does not return duration; estimate from character count at typical narration pace.
  // This is refined by the worker reading the MP3 header when a precise value is required.
  return Math.max(1, Math.round(text.length / AVG_CHARS_PER_SECOND));
}

/**
 * Splits `text` into chunks no longer than `maxChars`, preferring
 * natural boundaries so the seam between MP3 segments lands at the
 * end of a sentence (or paragraph) — minimizes the audible click and
 * keeps narration cadence sensible.
 *
 * Strategy, in order:
 *   1. Greedily pack whole sentences (split on `[.!?]\s+` and `\n`).
 *   2. If a single sentence is itself longer than `maxChars`, split
 *      it on word boundaries.
 *   3. Last-resort character slice — guards against pathological
 *      inputs (e.g. one giant URL with no spaces).
 *
 * Exported so it can be unit-tested without an OpenAI client.
 */
export function chunkForOpenAi(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  // Split into sentence-ish pieces but KEEP the trailing punctuation.
  // The regex matches "anything ending in . ? ! followed by space" plus
  // the final tail. We also split on hard newlines so paragraph breaks
  // remain natural seams.
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Flush whatever we've got, then split this oversize sentence.
      if (current.length > 0) {
        chunks.push(current);
        current = "";
      }
      for (const piece of splitOversize(sentence, maxChars)) {
        chunks.push(piece);
      }
      continue;
    }
    const next = current.length === 0 ? sentence : `${current} ${sentence}`;
    if (next.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Splits a single oversize "sentence" on word boundaries first, then
 * falls back to brute-force character slicing if even that fails
 * (e.g. one giant URL).
 */
function splitOversize(sentence: string, maxChars: number): string[] {
  const out: string[] = [];
  const words = sentence.split(/\s+/);
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        out.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > maxChars) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

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
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: input.voice as OpenAI.Audio.SpeechCreateParams["voice"],
      input: input.text,
      response_format: input.format,
    });

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

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

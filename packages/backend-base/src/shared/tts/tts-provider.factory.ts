import { InternalServerError } from "../../common/errors";
import { OpenAiTtsProvider } from "./providers/openai-tts.provider";
import { StubTtsProvider } from "./providers/stub-tts.provider";
import type { TtsProvider } from "./tts-provider.interface";

export type TtsProviderName = "openai" | "stub";

export function createTtsProvider(name?: string): TtsProvider {
  const resolved = (name ?? process.env.TTS_PROVIDER ?? "openai").toLowerCase();

  switch (resolved) {
    case "openai":
      return new OpenAiTtsProvider();
    case "stub":
      return new StubTtsProvider();
    default:
      throw new InternalServerError(
        `Unknown TTS_PROVIDER "${resolved}" — supported: openai, stub`,
      );
  }
}

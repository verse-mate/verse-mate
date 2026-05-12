import type { AiProvider } from "./ai-provider.interface";
import { OpenAiProvider } from "./openai.provider";
import { StubAiProvider } from "./stub.provider";

/**
 * Factory that resolves an AiProvider based on the `AI_PROVIDER` env var.
 *
 *   AI_PROVIDER=openai   (default)
 *   AI_PROVIDER=stub     (tests / dev without OpenAI key)
 *
 * Returns a singleton per process for the resolved provider.
 *
 * Per spec feat-integrations br-int-001 (D-001).
 */
let cached: AiProvider | null = null;

export function getAiProvider(name?: string): AiProvider {
  if (cached && !name) return cached;

  const resolved = (name ?? process.env.AI_PROVIDER ?? "openai").toLowerCase();
  let provider: AiProvider;

  switch (resolved) {
    case "openai":
      provider = new OpenAiProvider();
      break;
    case "stub":
      provider = new StubAiProvider();
      break;
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${resolved}" — supported: openai, stub`,
      );
  }

  if (!name) cached = provider;
  return provider;
}

/** For tests: reset the singleton. */
export function resetAiProviderCache(): void {
  cached = null;
}

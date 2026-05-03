import type {
  AiChatOptions,
  AiChatResponse,
  AiProvider,
} from "./ai-provider.interface";

/**
 * Stub AI provider for tests and dev environments.
 *
 * Returns a deterministic, low-cost response so tests don't burn OpenAI billing
 * and don't depend on network. The output is keyed on the last user message so
 * snapshot tests are stable.
 */
export class StubAiProvider implements AiProvider {
  readonly name = "stub";

  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    const lastUserMessage = opts.messages
      .slice()
      .reverse()
      .find((m) => m.role === "user");
    const echo = lastUserMessage?.content ?? "";

    return {
      content: `[stub:${opts.model}] ${echo.slice(0, 80)}`,
      model: `stub-${opts.model}`,
      usage: {
        promptTokens: opts.messages.reduce(
          (acc, m) => acc + Math.ceil(m.content.length / 4),
          0,
        ),
        completionTokens: 16,
        totalTokens: 0, // recomputed below
      },
    };
  }
}

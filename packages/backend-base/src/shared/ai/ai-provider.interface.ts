/**
 * AI Provider Interface
 *
 * Provider-agnostic contract for chat completions. Per spec feat-integrations
 * br-int-001 (D-001): consumer code MUST go through this interface, never
 * `new OpenAI(...)` directly.
 *
 * Initial implementations:
 *  - openai (OpenAiProvider) — production, uses `openai` SDK
 *  - stub (StubAiProvider) — tests / dev, returns deterministic fixture
 *
 * Future providers (Anthropic, Vertex, Bedrock, etc.) plug in here without
 * touching consumer code. Selected via `AI_PROVIDER` env (default: openai).
 */

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatOptions {
  /** Model identifier — provider-specific. e.g. "gpt-5", "gpt-5-nano", "stub". */
  model: string;
  /** Conversation messages in order. */
  messages: AiChatMessage[];
  /** 0..2 — sampling randomness. Provider may clamp. */
  temperature?: number;
  /** Optional max tokens for the response. */
  maxTokens?: number;
  /**
   * Optional response_format for providers that support it (e.g. OpenAI JSON mode).
   * Pass-through; not all providers honor this.
   */
  responseFormat?: { type: "text" | "json_object" };
}

export interface AiChatResponse {
  /** Generated text content. */
  content: string;
  /** Provider/model that generated this (for audit). */
  model: string;
  /** Token usage if reported by provider. */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiProvider {
  /** Provider identifier (e.g. "openai", "stub"). */
  readonly name: string;

  /** Send a chat completion request. */
  chatComplete(opts: AiChatOptions): Promise<AiChatResponse>;
}

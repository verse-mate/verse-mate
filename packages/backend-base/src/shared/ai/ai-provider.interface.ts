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

/**
 * Options for the Responses API (newer Assistants-style API).
 * Used by admin prompt playground + explanation regeneration + topic
 * translation where instruction-style input is preferred over messages.
 */
export interface AiResponseOptions {
  /** Model identifier (e.g. "gpt-5", "gpt-5-nano"). */
  model: string;
  /** Free-form instruction string (system role equivalent). */
  instructions?: string;
  /** Free-form input (user role equivalent). */
  input: string;
  /** Reasoning effort hint: "low" | "medium" | "high". */
  reasoningEffort?: "low" | "medium" | "high";
  /** Max output tokens. */
  maxOutputTokens?: number;
}

export interface AiResponseResult {
  /** Generated text content. */
  outputText: string;
  /** Provider/model that generated this. */
  model: string;
}

export interface AiProvider {
  /** Provider identifier (e.g. "openai", "stub"). */
  readonly name: string;

  /** Send a chat completion request. */
  chatComplete(opts: AiChatOptions): Promise<AiChatResponse>;

  /**
   * Send a Responses-API style request (instructions + input). Used by admin
   * prompt iteration + regeneration + topic translation flows. On OpenAI maps
   * to the Responses API; on stub returns a deterministic fixture.
   */
  responsesCreate(opts: AiResponseOptions): Promise<AiResponseResult>;
}

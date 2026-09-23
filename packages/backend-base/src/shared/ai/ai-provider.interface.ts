/**
 * AI Provider Interface
 *
 * Provider-agnostic contract for chat completions. Per spec feat-integrations
 * br-int-001 (D-001): consumer code MUST go through this interface, never
 * `new OpenAI(...)` directly.
 *
 * Initial implementations:
 *  - openai (OpenAiProvider), production, uses `openai` SDK
 *  - stub (StubAiProvider), tests / dev, returns deterministic fixture
 *
 * Future providers (Anthropic, Vertex, Bedrock, etc.) plug in here without
 * touching consumer code. Selected via `AI_PROVIDER` env (default: openai).
 */

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /**
   * Optional images to send alongside `content`, as `data:` URLs.
   *
   * Additive: existing callers pass none and are unaffected. Added for coach
   * session scoring, where the Visual Aids dimension asks whether charts,
   * slides or word-study tools were on screen, a question the transcript
   * cannot answer, because it is only in the picture. A provider that cannot
   * accept images ignores these rather than failing.
   */
  images?: string[];
}

export interface AiChatOptions {
  /** Model identifier, provider-specific. e.g. "gpt-5", "gpt-5-nano", "stub". */
  model: string;
  /** Conversation messages in order. */
  messages: AiChatMessage[];
  /** 0..2, sampling randomness. Provider may clamp. */
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

/**
 * Files API, used by admin batch operations to upload JSONL request files
 * and download result files. Per OpenAI semantics: upload returns a file_id
 * which is then referenced by Batch operations.
 */
export interface AiFileCreateOptions {
  /** Web `File` object (or a Buffer the provider knows how to wrap). */
  file: File;
  /** Provider-specific purpose. For OpenAI batch, must be `"batch"`. */
  purpose: "batch" | "assistants" | "fine-tune" | "vision";
}

export interface AiFileResult {
  /** File ID assigned by the provider. */
  id: string;
  /** Original filename, if reported by provider. */
  filename?: string;
  /** Size in bytes. */
  bytes?: number;
  /** Status string (e.g. "uploaded", "processed", "error"). */
  status?: string;
  /** Purpose this file was created with. */
  purpose?: string;
  /** Creation timestamp (provider's epoch). */
  createdAt?: number;
}

/**
 * Batch API, used by admin to enqueue large JSONL request batches against
 * OpenAI's batch endpoint. Per OpenAI semantics: batch references an uploaded
 * input_file_id and produces an output_file_id (and possibly an error_file_id).
 */
export interface AiBatchCreateOptions {
  /** File ID returned from a prior `filesCreate({purpose: "batch"})` call. */
  inputFileId: string;
  /** Endpoint the batched requests target. */
  endpoint: "/v1/responses" | "/v1/chat/completions" | "/v1/embeddings";
  /** Completion window, currently OpenAI only accepts "24h". */
  completionWindow?: "24h";
  /** Optional metadata (echoed back on retrieve). */
  metadata?: Record<string, string>;
}

export type AiBatchStatus =
  | "validating"
  | "failed"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface AiBatchResult {
  /** Batch ID assigned by the provider. */
  id: string;
  /** Current batch status. */
  status: AiBatchStatus;
  /** Input file id referenced when the batch was created. */
  inputFileId: string;
  /** Output file id once the batch completes (results JSONL). */
  outputFileId?: string;
  /** Error file id if the batch produced per-row errors. */
  errorFileId?: string;
  /** Endpoint the batch targets. */
  endpoint?: string;
  /** Per-status request counts. */
  requestCounts?: { total: number; completed: number; failed: number };
  /** Creation timestamp (epoch seconds). */
  createdAt?: number;
  /** Completion timestamp (epoch seconds). */
  completedAt?: number;
  /** Cancellation timestamp (epoch seconds). */
  cancelledAt?: number;
  /** Failure timestamp (epoch seconds). */
  failedAt?: number;
  /** Optional metadata echoed back. */
  metadata?: Record<string, string> | null;
  /** Errors object (provider-specific shape). */
  errors?: { object: string; data: unknown[] } | null;
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

  /** Upload a file (used to feed batched JSONL requests). */
  filesCreate(opts: AiFileCreateOptions): Promise<AiFileResult>;

  /** Retrieve metadata for a previously uploaded file. */
  filesRetrieve(fileId: string): Promise<AiFileResult>;

  /** Download the bytes of a previously uploaded/produced file. */
  filesContent(fileId: string): Promise<Response>;

  /** Submit a batch job referencing a previously uploaded input file. */
  batchesCreate(opts: AiBatchCreateOptions): Promise<AiBatchResult>;

  /** Retrieve current state of a batch job. */
  batchesRetrieve(batchId: string): Promise<AiBatchResult>;

  /** Cancel an in-progress batch job. */
  batchesCancel(batchId: string): Promise<AiBatchResult>;
}

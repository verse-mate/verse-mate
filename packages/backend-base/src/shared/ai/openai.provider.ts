import OpenAI from "openai";
import type {
  AiBatchCreateOptions,
  AiBatchResult,
  AiBatchStatus,
  AiChatOptions,
  AiChatResponse,
  AiFileCreateOptions,
  AiFileResult,
  AiProvider,
  AiResponseOptions,
  AiResponseResult,
  AiTranscription,
} from "./ai-provider.interface";

const REASONING_MODEL = /^(gpt-5(?!-chat)|o\d)/;
const STREAM_IDLE_MS = 90_000;
const STREAM_TOTAL_MS = 15 * 60_000;

interface OpenAiStreamEvent {
  type: string;
  delta?: string;
  message?: string;
  response?: {
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
    incomplete_details?: { reason?: string };
    error?: { message?: string };
  };
}

/**
 * OpenAI implementation of AiProvider. Uses the `openai` SDK; chat requests go
 * through the Responses API, streamed.
 *
 * Apikey from `OPEN_AI_KEY` env. Models passed through as-is.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly idleMs: number;
  private readonly totalMs: number;

  constructor(apiKey?: string, timing?: { idleMs?: number; totalMs?: number }) {
    this.idleMs = timing?.idleMs ?? STREAM_IDLE_MS;
    this.totalMs = timing?.totalMs ?? STREAM_TOTAL_MS;
    const key = apiKey ?? process.env.OPEN_AI_KEY;
    if (!key) {
      throw new Error(
        "OPEN_AI_KEY env not set; cannot construct OpenAiProvider",
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async transcribeAudio(opts: {
    file: File | Blob;
    model?: string;
  }): Promise<AiTranscription> {
    const result = await this.client.audio.transcriptions.create({
      file: opts.file as File,
      model: opts.model ?? "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
    return {
      segments: (result.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
    };
  }

  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    const reasons = REASONING_MODEL.test(opts.model);
    const abort = new AbortController();
    let stalled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const quiet = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        stalled = true;
        abort.abort();
      }, this.idleMs);
    };
    const total = setTimeout(() => abort.abort(), this.totalMs);
    try {
      return await this.streamChat(opts, reasons, abort.signal, quiet, () =>
        stalled
          ? `no data for ${this.idleMs} ms`
          : abort.signal.aborted
            ? `ran past the ${this.totalMs} ms limit`
            : null,
      );
    } finally {
      clearTimeout(idle);
      clearTimeout(total);
    }
  }

  private async streamChat(
    opts: AiChatOptions,
    reasons: boolean,
    signal: AbortSignal,
    heard: () => void,
    stoppedBecause: () => string | null,
  ): Promise<AiChatResponse> {
    const stream = await (this.client as any).responses
      .create(
        {
          model: opts.model,
          input: opts.messages.map((m) =>
            m.role === "user" && m.images?.length
              ? {
                  role: "user",
                  content: [
                    { type: "input_text", text: m.content },
                    ...m.images.map((url) => ({
                      type: "input_image",
                      image_url: url,
                    })),
                  ],
                }
              : { role: m.role, content: m.content },
          ),
          ...(opts.temperature != null && { temperature: opts.temperature }),
          ...(reasons && {
            reasoning: {
              ...(opts.reasoningEffort != null && {
                effort: opts.reasoningEffort,
              }),
              summary: "auto",
            },
          }),
          ...(opts.maxTokens !== undefined && {
            max_output_tokens: opts.maxTokens,
          }),
          ...(opts.responseFormat && {
            text: { format: { type: opts.responseFormat.type } },
          }),
          store: false,
          stream: true,
        },
        { signal },
      )
      .catch((error: unknown) => {
        const stopped = stoppedBecause();
        if (stopped)
          throw new Error(
            `OpenAI stream stopped for model=${opts.model}: ${stopped}`,
          );
        throw error;
      });

    let content = "";
    let model = "";
    let usage:
      | { input_tokens: number; output_tokens: number; total_tokens: number }
      | undefined;
    let completed = false;
    heard();
    for await (const event of stream as AsyncIterable<OpenAiStreamEvent>) {
      heard();
      if (event.type === "response.output_text.delta") {
        content += event.delta ?? "";
      } else if (event.type === "response.completed") {
        completed = true;
        model = event.response?.model ?? model;
        usage = event.response?.usage;
      } else if (
        event.type === "response.failed" ||
        event.type === "response.incomplete" ||
        event.type === "error"
      ) {
        const reason =
          event.response?.incomplete_details?.reason ??
          event.response?.error?.message ??
          event.message ??
          event.type;
        throw new Error(
          `OpenAI did not complete the response for model=${opts.model}: ${reason}`,
        );
      }
    }
    const stopped = completed ? null : stoppedBecause();
    if (stopped) {
      throw new Error(
        `OpenAI stream stopped for model=${opts.model}: ${stopped}`,
      );
    }
    if (!completed) {
      throw new Error(
        `OpenAI stream ended before completing for model=${opts.model}`,
      );
    }
    if (!content) {
      throw new Error(`OpenAI returned no content for model=${opts.model}`);
    }

    return {
      content,
      model: model || opts.model,
      ...(usage && {
        usage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.total_tokens,
        },
      }),
    };
  }

  async responsesCreate(opts: AiResponseOptions): Promise<AiResponseResult> {
    const response = await (this.client as any).responses.create({
      model: opts.model,
      ...(opts.instructions !== undefined && {
        instructions: opts.instructions,
      }),
      input: opts.input,
      ...(opts.reasoningEffort && {
        reasoning: { effort: opts.reasoningEffort },
      }),
      ...(opts.maxOutputTokens !== undefined && {
        max_output_tokens: opts.maxOutputTokens,
      }),
    });

    return {
      outputText: response.output_text || "",
      model: response.model || opts.model,
    };
  }

  async filesCreate(opts: AiFileCreateOptions): Promise<AiFileResult> {
    const file = await this.client.files.create({
      file: opts.file,
      purpose: opts.purpose,
    });
    return mapOpenAiFile(file);
  }

  async filesRetrieve(fileId: string): Promise<AiFileResult> {
    const file = await this.client.files.retrieve(fileId);
    return mapOpenAiFile(file);
  }

  async filesContent(fileId: string): Promise<Response> {
    return this.client.files.content(fileId);
  }

  async batchesCreate(opts: AiBatchCreateOptions): Promise<AiBatchResult> {
    const batch = await this.client.batches.create({
      input_file_id: opts.inputFileId,
      endpoint: opts.endpoint,
      completion_window: opts.completionWindow ?? "24h",
      ...(opts.metadata && { metadata: opts.metadata }),
    });
    return mapOpenAiBatch(batch);
  }

  async batchesRetrieve(batchId: string): Promise<AiBatchResult> {
    const batch = await this.client.batches.retrieve(batchId);
    return mapOpenAiBatch(batch);
  }

  async batchesCancel(batchId: string): Promise<AiBatchResult> {
    const batch = await this.client.batches.cancel(batchId);
    return mapOpenAiBatch(batch);
  }
}

function mapOpenAiFile(file: any): AiFileResult {
  return {
    id: file.id,
    filename: file.filename,
    bytes: file.bytes,
    status: file.status,
    purpose: file.purpose,
    createdAt: file.created_at,
  };
}

function mapOpenAiBatch(batch: any): AiBatchResult {
  return {
    id: batch.id,
    status: batch.status as AiBatchStatus,
    inputFileId: batch.input_file_id,
    outputFileId: batch.output_file_id ?? undefined,
    errorFileId: batch.error_file_id ?? undefined,
    endpoint: batch.endpoint,
    requestCounts: batch.request_counts
      ? {
          total: batch.request_counts.total,
          completed: batch.request_counts.completed,
          failed: batch.request_counts.failed,
        }
      : undefined,
    createdAt: batch.created_at,
    completedAt: batch.completed_at ?? undefined,
    cancelledAt: batch.cancelled_at ?? undefined,
    failedAt: batch.failed_at ?? undefined,
    metadata: batch.metadata ?? null,
    errors: batch.errors ?? null,
  };
}

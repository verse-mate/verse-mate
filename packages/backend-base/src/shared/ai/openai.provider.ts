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
} from "./ai-provider.interface";

/**
 * OpenAI implementation of AiProvider. Uses the `openai` SDK + chat completions API.
 *
 * Apikey from `OPEN_AI_KEY` env. Models passed through as-is.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPEN_AI_KEY;
    if (!key) {
      throw new Error(
        "OPEN_AI_KEY env not set; cannot construct OpenAiProvider",
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    const completion = await this.client.chat.completions.create({
      model: opts.model,
      messages: opts.messages,
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
      ...(opts.maxTokens !== undefined && { max_tokens: opts.maxTokens }),
      ...(opts.responseFormat && { response_format: opts.responseFormat }),
    });

    const choice = completion.choices[0];
    if (!choice?.message?.content) {
      throw new Error(`OpenAI returned no content for model=${opts.model}`);
    }

    return {
      content: choice.message.content,
      model: completion.model,
      ...(completion.usage && {
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
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

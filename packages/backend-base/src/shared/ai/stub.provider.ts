import type {
  AiBatchCreateOptions,
  AiBatchResult,
  AiChatOptions,
  AiChatResponse,
  AiFileCreateOptions,
  AiFileResult,
  AiProvider,
  AiResponseOptions,
  AiResponseResult,
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
        totalTokens: 0,
      },
    };
  }

  async responsesCreate(opts: AiResponseOptions): Promise<AiResponseResult> {
    return {
      outputText: `[stub-responses:${opts.model}] ${opts.input.slice(0, 80)}`,
      model: `stub-${opts.model}`,
    };
  }

  // Files / Batch — deterministic in-memory fakes. Keyed on input id so the
  // same id consistently round-trips. Tests that need real OpenAI semantics
  // should mock this provider directly rather than rely on these stubs.
  private fileCounter = 0;
  private batchCounter = 0;
  private files = new Map<string, { name: string; bytes: number; content: string }>();
  private batches = new Map<string, AiBatchResult>();

  async filesCreate(opts: AiFileCreateOptions): Promise<AiFileResult> {
    const id = `stub-file-${++this.fileCounter}`;
    const bytes = await opts.file
      .arrayBuffer()
      .then((b) => b.byteLength)
      .catch(() => 0);
    const content = await opts.file.text().catch(() => "");
    this.files.set(id, { name: opts.file.name, bytes, content });
    return {
      id,
      filename: opts.file.name,
      bytes,
      status: "processed",
      purpose: opts.purpose,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async filesRetrieve(fileId: string): Promise<AiFileResult> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`stub: file ${fileId} not found`);
    }
    return {
      id: fileId,
      filename: file.name,
      bytes: file.bytes,
      status: "processed",
      createdAt: Math.floor(Date.now() / 1000),
    };
  }

  async filesContent(fileId: string): Promise<Response> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`stub: file ${fileId} not found`);
    }
    return new Response(file.content);
  }

  async batchesCreate(opts: AiBatchCreateOptions): Promise<AiBatchResult> {
    const id = `stub-batch-${++this.batchCounter}`;
    const result: AiBatchResult = {
      id,
      status: "validating",
      inputFileId: opts.inputFileId,
      endpoint: opts.endpoint,
      requestCounts: { total: 0, completed: 0, failed: 0 },
      createdAt: Math.floor(Date.now() / 1000),
      metadata: opts.metadata ?? null,
    };
    this.batches.set(id, result);
    return result;
  }

  async batchesRetrieve(batchId: string): Promise<AiBatchResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`stub: batch ${batchId} not found`);
    }
    return batch;
  }

  async batchesCancel(batchId: string): Promise<AiBatchResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`stub: batch ${batchId} not found`);
    }
    const cancelled: AiBatchResult = {
      ...batch,
      status: "cancelled",
      cancelledAt: Math.floor(Date.now() / 1000),
    };
    this.batches.set(batchId, cancelled);
    return cancelled;
  }
}

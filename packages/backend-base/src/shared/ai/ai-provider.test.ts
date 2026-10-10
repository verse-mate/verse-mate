import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getAiProvider, resetAiProviderCache } from "./ai-provider.factory";
import type { AiChatOptions } from "./ai-provider.interface";
import { OpenAiProvider } from "./openai.provider";
import { StubAiProvider } from "./stub.provider";

describe("AiProvider factory", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AI_PROVIDER;
    resetAiProviderCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env.AI_PROVIDER = undefined;
    } else {
      process.env.AI_PROVIDER = originalEnv;
    }
    resetAiProviderCache();
  });

  it("returns stub provider when AI_PROVIDER=stub", () => {
    process.env.AI_PROVIDER = "stub";
    const provider = getAiProvider();
    expect(provider.name).toBe("stub");
  });

  it("throws on unknown provider name", () => {
    expect(() => getAiProvider("not-a-real-provider")).toThrow(
      /Unknown AI_PROVIDER/,
    );
  });

  it("caches the singleton between calls", () => {
    process.env.AI_PROVIDER = "stub";
    const a = getAiProvider();
    const b = getAiProvider();
    expect(a).toBe(b);
  });

  it("explicit name bypasses cache", () => {
    process.env.AI_PROVIDER = "stub";
    const cached = getAiProvider();
    const explicit = getAiProvider("stub");
    expect(cached).toBeInstanceOf(StubAiProvider);
    expect(explicit).toBeInstanceOf(StubAiProvider);
    // Different instances because explicit name skips cache
    expect(cached).not.toBe(explicit);
  });
});

describe("StubAiProvider", () => {
  const provider = new StubAiProvider();

  it("returns deterministic response keyed on user message", async () => {
    const response = await provider.chatComplete({
      model: "gpt-5",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the meaning of life?" },
      ],
    });

    expect(response.content).toContain("[stub:gpt-5]");
    expect(response.content).toContain("What is the meaning of life?");
    expect(response.model).toBe("stub-gpt-5");
  });

  it("reports token usage estimate", async () => {
    const response = await provider.chatComplete({
      model: "gpt-5",
      messages: [{ role: "user", content: "hello world" }],
    });

    expect(response.usage).toBeDefined();
    expect(response.usage?.promptTokens).toBeGreaterThan(0);
    expect(response.usage?.completionTokens).toBe(16);
  });

  it("handles empty messages array", async () => {
    const response = await provider.chatComplete({
      model: "gpt-5",
      messages: [],
    });

    expect(response.content).toContain("[stub:gpt-5]");
    expect(response.usage?.promptTokens).toBe(0);
  });

  it("identical input produces identical output (deterministic)", async () => {
    const opts = {
      model: "gpt-5",
      messages: [{ role: "user" as const, content: "test prompt" }],
    };
    const a = await provider.chatComplete(opts);
    const b = await provider.chatComplete(opts);
    expect(a.content).toBe(b.content);
    expect(a.model).toBe(b.model);
  });
});

describe("StubAiProvider responsesCreate", () => {
  const provider = new StubAiProvider();

  it("returns deterministic output for given input", async () => {
    const response = await provider.responsesCreate({
      model: "gpt-5",
      input: "Tell me about Genesis 1.",
    });

    expect(response.outputText).toContain("[stub-responses:gpt-5]");
    expect(response.outputText).toContain("Tell me about Genesis 1.");
    expect(response.model).toBe("stub-gpt-5");
  });

  it("identical input produces identical output", async () => {
    const opts = {
      model: "gpt-5",
      input: "test input",
      instructions: "follow these instructions",
      reasoningEffort: "medium" as const,
      maxOutputTokens: 1000,
    };
    const a = await provider.responsesCreate(opts);
    const b = await provider.responsesCreate(opts);
    expect(a.outputText).toBe(b.outputText);
    expect(a.model).toBe(b.model);
  });

  it("ignores instructions/reasoningEffort/maxOutputTokens for output (deterministic)", async () => {
    const a = await provider.responsesCreate({
      model: "gpt-5",
      input: "same input",
    });
    const b = await provider.responsesCreate({
      model: "gpt-5",
      input: "same input",
      instructions: "different",
      reasoningEffort: "high",
      maxOutputTokens: 5000,
    });
    expect(a.outputText).toBe(b.outputText);
  });
});

type StreamEvent = Record<string, unknown>;

function* eventsOf(
  parts: string[],
  usage = { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
): Generator<StreamEvent> {
  yield { type: "response.created", response: { model: "gpt-5-served" } };
  yield { type: "response.reasoning_summary_text.delta", delta: "thinking" };
  for (const part of parts)
    yield { type: "response.output_text.delta", delta: part };
  yield {
    type: "response.completed",
    response: { model: "gpt-5-served", usage },
  };
}

async function* streamOf(events: Iterable<StreamEvent>) {
  for (const event of events) yield event;
}

function providerSending(
  sent: Record<string, unknown>[],
  events: () => Iterable<StreamEvent> = () => eventsOf(["{", "}"]),
  timing?: { idleMs?: number; totalMs?: number },
) {
  const provider = new OpenAiProvider("test-key", timing);
  (provider as unknown as { client: unknown }).client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        sent.push(body);
        return streamOf(events());
      },
    },
  };
  return provider;
}

describe("OpenAiProvider chatComplete", () => {
  async function sentFor(opts: Partial<AiChatOptions>) {
    const sent: Record<string, unknown>[] = [];
    await providerSending(sent).chatComplete({
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
      ...opts,
    });
    return sent[0];
  }

  it("streams through the Responses API with reasoning summaries, so a long reasoning phase keeps sending data, and stores nothing", async () => {
    expect(await sentFor({})).toMatchObject({
      model: "gpt-5",
      stream: true,
      store: false,
      reasoning: { summary: "auto" },
    });
  });

  it("a model that does not reason gets no reasoning summary request", async () => {
    const sent = await sentFor({ model: "gpt-4.1-mini" });
    expect(sent).not.toHaveProperty("reasoning");
  });

  it("assembles the streamed text, the served model and the usage", async () => {
    const sent: Record<string, unknown>[] = [];
    const response = await providerSending(sent, () =>
      eventsOf(['{"a":', "1}"], {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
      }),
    ).chatComplete({
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(response).toEqual({
      content: '{"a":1}',
      model: "gpt-5-served",
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    });
  });

  it("system prompts travel as input messages, where JSON mode looks for the word json", async () => {
    const sent = await sentFor({
      messages: [
        { role: "system", content: "Return JSON." },
        { role: "user", content: "hi" },
      ],
      responseFormat: { type: "json_object" },
    });
    expect(sent.input).toEqual([
      { role: "system", content: "Return JSON." },
      { role: "user", content: "hi" },
    ]);
    expect(sent).toMatchObject({ text: { format: { type: "json_object" } } });
    expect(sent).not.toHaveProperty("instructions");
  });

  it("images on a user message become input images beside its text", async () => {
    const sent = await sentFor({
      messages: [
        {
          role: "user",
          content: "look",
          images: ["data:image/jpeg;base64,AAA"],
        },
      ],
    });
    expect(sent.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "look" },
          { type: "input_image", image_url: "data:image/jpeg;base64,AAA" },
        ],
      },
    ]);
  });

  it("a token limit is sent as max_output_tokens, never max_tokens", async () => {
    const sent = await sentFor({ maxTokens: 1200 });
    expect(sent).toMatchObject({ max_output_tokens: 1200 });
    expect(sent).not.toHaveProperty("max_tokens");
    expect(sent).not.toHaveProperty("max_completion_tokens");
  });

  it("null settings send neither key, the same request as none at all", async () => {
    const withNulls = await sentFor({
      temperature: null,
      reasoningEffort: null,
    });
    expect(withNulls).not.toHaveProperty("temperature");
    expect(withNulls.reasoning).toEqual({ summary: "auto" });
    expect(withNulls).toEqual(await sentFor({}));
  });

  it("set settings are passed through", async () => {
    expect(
      await sentFor({ temperature: 0.2, reasoningEffort: "low" }),
    ).toMatchObject({
      temperature: 0.2,
      reasoning: { effort: "low", summary: "auto" },
    });
  });

  it("an empty streamed answer is an error naming the model", async () => {
    const sent: Record<string, unknown>[] = [];
    await expect(
      providerSending(sent, () => eventsOf([])).chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("OpenAI returned no content for model=gpt-5");
  });

  it("a failed or incomplete response is an error, not a partial answer", async () => {
    const sent: Record<string, unknown>[] = [];
    await expect(
      providerSending(sent, function* () {
        yield { type: "response.output_text.delta", delta: '{"a":' };
        yield {
          type: "response.incomplete",
          response: { incomplete_details: { reason: "max_output_tokens" } },
        };
      }).chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("max_output_tokens");
  });

  it("a stream that ends without completing is an error, never a partial answer", async () => {
    const sent: Record<string, unknown>[] = [];
    await expect(
      providerSending(sent, function* () {
        yield { type: "response.output_text.delta", delta: '{"strengths":[' };
      }).chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("ended before completing");
  });

  it("a failed response and an error event are errors", async () => {
    for (const event of [
      {
        type: "response.failed",
        response: { error: { message: "server_error" } },
      },
      { type: "error", message: "rate limited" },
    ]) {
      const sent: Record<string, unknown>[] = [];
      await expect(
        providerSending(sent, function* () {
          yield event;
        }).chatComplete({
          model: "gpt-5",
          messages: [{ role: "user", content: "hi" }],
        }),
      ).rejects.toThrow("did not complete");
    }
  });

  it("a stream that stops sending events is aborted after the idle limit and reported as stalled", async () => {
    const provider = new OpenAiProvider("test-key", { idleMs: 50 });
    (provider as unknown as { client: unknown }).client = {
      responses: {
        create: async (_body: unknown, options: { signal: AbortSignal }) =>
          (async function* () {
            yield { type: "response.output_text.delta", delta: "{" };
            await new Promise<void>((resolve) =>
              options.signal.addEventListener("abort", () => resolve()),
            );
          })(),
      },
    };
    await expect(
      provider.chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("no data for 50 ms");
  });

  it("gpt-5-chat models get no reasoning request, since they do not reason", async () => {
    const sent = await sentFor({ model: "gpt-5-chat-latest" });
    expect(sent).not.toHaveProperty("reasoning");
  });

  it("the idle limit does not run while the request waits for its response to start, which the SDK's own timeout covers", async () => {
    const provider = new OpenAiProvider("test-key", { idleMs: 20 });
    (provider as unknown as { client: unknown }).client = {
      responses: {
        create: async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return streamOf(eventsOf(['{"ok":true}']));
        },
      },
    };
    const response = await provider.chatComplete({
      model: "gpt-5",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(response.content).toBe('{"ok":true}');
  });

  it("a stream running past the total limit is stopped with a message naming the limit", async () => {
    const provider = new OpenAiProvider("test-key", {
      idleMs: 1000,
      totalMs: 60,
    });
    (provider as unknown as { client: unknown }).client = {
      responses: {
        create: async (_body: unknown, options: { signal: AbortSignal }) =>
          (async function* () {
            while (!options.signal.aborted) {
              yield { type: "response.output_text.delta", delta: "." };
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
          })(),
      },
    };
    await expect(
      provider.chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("ran past the 60 ms limit");
  });

  it("a request that fails to start is that failure, with no timer left running", async () => {
    const provider = new OpenAiProvider("test-key", {
      idleMs: 10,
      totalMs: 20,
    });
    (provider as unknown as { client: unknown }).client = {
      responses: {
        create: async () => {
          throw new Error("401 invalid key");
        },
      },
    };
    await expect(
      provider.chatComplete({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("401 invalid key");
  });
});

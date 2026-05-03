import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getAiProvider, resetAiProviderCache } from "./ai-provider.factory";
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

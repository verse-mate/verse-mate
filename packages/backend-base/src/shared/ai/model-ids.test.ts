import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import { currentModel, replaceRetiredModel } from "./model-ids";

describe("currentModel", () => {
  it("swaps each model OpenAI retires on 2026-12-11 for its replacement, dated snapshots included", () => {
    expect(currentModel("gpt-5")).toBe("gpt-6.1-sol");
    expect(currentModel("gpt-5-mini")).toBe("gpt-6.1-terra");
    expect(currentModel("gpt-5-nano")).toBe("gpt-6-luna");
    expect(currentModel("gpt-5-nano-2025-08-07")).toBe("gpt-6-luna");
    expect(currentModel(" GPT-5 ")).toBe("gpt-6.1-sol");
  });

  it("leaves models that are not retired alone, even when they share a prefix", () => {
    for (const model of [
      "gpt-6.1-sol",
      "gpt-5.4-nano-2026-03-17",
      "gpt-5-chat-latest",
      "gpt-5-pro",
      "whisper-1",
    ])
      expect(currentModel(model)).toBe(model);
  });
});

describe("replaceRetiredModel as a request transform", () => {
  it("a route that validates model as a string receives the replacement, so an admin page cached before the switch still submits a live model", async () => {
    const app = new Elysia()
      .onTransform(replaceRetiredModel)
      .post("/batch", ({ body }) => body.model, {
        body: t.Object({ model: t.String() }),
      });
    const response = await app.handle(
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-5-mini" }),
      }),
    );
    expect(await response.text()).toBe("gpt-6.1-terra");
  });
});

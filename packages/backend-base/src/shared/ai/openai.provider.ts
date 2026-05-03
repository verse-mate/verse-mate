import OpenAI from "openai";
import type {
  AiChatOptions,
  AiChatResponse,
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
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI Responses API types lag SDK
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
}

/**
 * Run an array of OpenAI-Batch-shaped requests through a LOCAL `claude -p`
 * subprocess instead of submitting them to the OpenAI Batch API, and produce
 * output in the SAME JSONL line shape that the existing `process*OutputFile`
 * writebacks parse. This lets the local Claude path reuse the unchanged
 * request-building (`buildBookTranslateRequests` / `buildStudyTranslateRequests`)
 * and the unchanged writeback (`processTranslateOutputFile` /
 * `processStudyTranslateOutputFile`) — only the OpenAI "middle step" is swapped.
 *
 * Per-request transport is delegated to `runClaudeTranslate` (see
 * `study-claude-translator.ts`); this module is the batch driver around it:
 * sequential execution (single subscription), usage-limit short-circuit, and
 * OpenAI-output-line synthesis.
 */
import { runClaudeTranslate } from "./study-claude-translator";

/**
 * Minimal compatible shape of the request objects the batch services build.
 * The full `BatchJobRequest` interface in `batch-operations.service.ts` is not
 * exported; we only read these fields here, so a structurally-compatible local
 * definition keeps this module decoupled while remaining assignable from the
 * service's array.
 */
export interface BatchJobRequestLike {
  custom_id: string;
  body: {
    model: string;
    instructions?: string;
    input: string;
  };
}

export interface ClaudeBatchResult {
  /** Newline-joined OpenAI-output-shaped lines, ready for a `process*OutputFile`. */
  jsonl: string;
  total: number;
  succeeded: number;
  failed: number;
  /** True if we hit a usage/session limit and stopped early. */
  stoppedByUsageLimit: boolean;
}

export interface ExecuteBatchViaClaudeOptions {
  /** Claude model alias passed through to `runClaudeTranslate` ("haiku" | "sonnet" | "opus"). */
  model: string;
  /** Dedicated-subscription config dir (CLAUDE_CONFIG_DIR). Omit = ambient login. */
  configDir?: string;
  /** Hard per-request subprocess timeout, ms. */
  timeoutMs?: number;
  /** Called after each processed request (whether success or failure). */
  onProgress?: (done: number, total: number, customId: string) => void;
}

/**
 * Run each request sequentially through `claude -p` and synthesize an
 * OpenAI-output JSONL line per processed request, matching exactly what the
 * writebacks parse: `custom_id`, `response.status_code`,
 * `response.body.usage.{input_tokens,output_tokens}`, and the text at
 * `response.body.output[0].content[0].text`.
 *
 * Usage limit → stop early (no line emitted for the limited request; the
 * remaining requests are simply not processed this run). Transient/error
 * responses and thrown spawn/timeout failures emit a non-200 line so the
 * writeback counts them as errors and skips them, without aborting the batch.
 */
export async function executeBatchRequestsViaClaude(
  requests: BatchJobRequestLike[],
  opts: ExecuteBatchViaClaudeOptions,
): Promise<ClaudeBatchResult> {
  const { model, configDir, timeoutMs, onProgress } = opts;
  const total = requests.length;
  const lines: string[] = [];
  let succeeded = 0;
  let failed = 0;
  let done = 0;
  let stoppedByUsageLimit = false;

  for (const req of requests) {
    if (stoppedByUsageLimit) break;

    const customId = req.custom_id;

    try {
      const result = await runClaudeTranslate({
        instruction: req.body.instructions ?? "",
        input: req.body.input,
        model,
        configDir,
        timeoutMs,
      });

      if (result.isUsageLimit) {
        // Hit a usage/session wall — stop and leave the rest unprocessed.
        // Do NOT emit a line for this request.
        stoppedByUsageLimit = true;
        break;
      }

      const inputTokens = result.usage?.input_tokens ?? 0;
      const outputTokens = result.usage?.output_tokens ?? 0;

      if (result.isError) {
        // Transient (e.g. 529) or other CLI error → non-200 line so the
        // writeback counts it as an error and skips it.
        failed++;
        lines.push(
          JSON.stringify({
            custom_id: customId,
            response: {
              status_code: result.apiErrorStatus ?? 500,
              body: {
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
              },
            },
          }),
        );
      } else {
        succeeded++;
        lines.push(
          JSON.stringify({
            custom_id: customId,
            response: {
              status_code: 200,
              body: {
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
                output: [{ content: [{ text: result.raw }] }],
              },
            },
          }),
        );
      }
    } catch (error) {
      // Spawn failure / timeout — emit a non-200 line and keep going.
      console.error(
        `[CLAUDE-BATCH] request ${customId} threw:`,
        error instanceof Error ? error.message : error,
      );
      failed++;
      lines.push(
        JSON.stringify({
          custom_id: customId,
          response: {
            status_code: 500,
            body: {
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        }),
      );
    }

    done++;
    onProgress?.(done, total, customId);
  }

  return {
    jsonl: lines.join("\n"),
    total,
    succeeded,
    failed,
    stoppedByUsageLimit,
  };
}

/**
 * Translate one study via a local `claude -p` subprocess (Claude subscription),
 * instead of the OpenAI Batch API. Pure transport: given the same `instruction`
 * (the DB `translate-study` prompt with `{language}` substituted) and `input`
 * (the same string the OpenAI path builds), it returns the model's raw text plus
 * usage / rate-limit metadata. Parsing + validation + writeback are handled by
 * the shared `BatchOperationService.writeStudyTranslation` so this path and the
 * OpenAI path can never drift.
 *
 * Proven recipe (claude 2.1.168, verified 2026-06-07):
 *   - MAX_THINKING_TOKENS=0 is MANDATORY — otherwise the model spends the whole
 *     window on extended thinking and emits no translation for minutes.
 *     `--effort low` does NOT disable thinking.
 *   - `--system-prompt` REPLACES the default (coding) system prompt.
 *   - `--setting-sources user` + cwd OUTSIDE the user's home keeps the giant
 *     project CLAUDE.md from leaking into context.
 *   - NEVER `--bare`: it drops the credential source ("Not logged in").
 *   - `--output-format json` envelope: { result, is_error, api_error_status,
 *     usage, session_id }.
 */
import { tmpdir } from "node:os";

/** A transient (server-side) API error worth resuming + retrying, NOT a quota wall. */
const TRANSIENT_API_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

export interface ClaudeTranslateResult {
  /** The model's response text (expected to be the translated study JSON). */
  raw: string;
  /** True when the CLI reported an error (auth, quota, transient API, etc.). */
  isError: boolean;
  /** HTTP-ish status from the CLI failure envelope, when present (e.g. 529). */
  apiErrorStatus: number | null;
  /** True when the error is server-side/transient (resume + retry), not a quota limit. */
  isTransient: boolean;
  /** True when the failure text looks like a usage/session limit (sleep until reset). */
  isUsageLimit: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  /** Session id from the envelope — pass to a resume on transient failure. */
  sessionId?: string;
  /** Wall-clock of the CLI call, ms. */
  durationMs?: number;
  /** Raw envelope, for callers that want the rest (modelUsage, cost, etc.). */
  envelope?: Record<string, unknown>;
}

export interface ClaudeTranslateOptions {
  /** System prompt (the translate-study prompt with {language} filled). */
  instruction: string;
  /** User input — the same string the OpenAI path sends. */
  input: string;
  /** Claude model alias: "haiku" (throughput default) | "sonnet" | "opus". */
  model?: string;
  /** Dedicated-subscription config dir (CLAUDE_CONFIG_DIR). Omit = ambient login. */
  configDir?: string;
  /** Hard timeout for the subprocess, ms. Default 6 min. */
  timeoutMs?: number;
  /** Path to the `claude` binary. Default "claude" (on PATH). */
  claudeBin?: string;
}

const DEFAULT_TIMEOUT_MS = 6 * 60_000;

function looksLikeUsageLimit(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("out of") &&
    (t.includes("usage") || t.includes("limit") || t.includes("resets"))
  );
}

/**
 * Run one translation through `claude -p`. Never throws on a model/CLI error —
 * inspect `isError` / `isTransient` / `isUsageLimit` and decide (retry vs
 * sleep-until-reset) at the caller. Throws only on spawn failure / timeout.
 */
export async function runClaudeTranslate(
  opts: ClaudeTranslateOptions,
): Promise<ClaudeTranslateResult> {
  const {
    instruction,
    input,
    model = "haiku",
    configDir,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    claudeBin = "claude",
  } = opts;

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    // The single most important flag — see file header.
    MAX_THINKING_TOKENS: "0",
  };
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;

  const proc = Bun.spawn(
    [
      claudeBin,
      "-p",
      "-",
      "--system-prompt",
      instruction,
      "--setting-sources",
      "user",
      "--model",
      model,
      "--output-format",
      "json",
    ],
    {
      // cwd outside the user's home so ~/CLAUDE.md is never auto-discovered.
      cwd: tmpdir(),
      env,
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const timer = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already gone
    }
  }, timeoutMs);

  let stdout: string;
  let exitCode: number;
  try {
    [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
  } finally {
    clearTimeout(timer);
  }

  if (!stdout.trim()) {
    const errText = await new Response(proc.stderr).text().catch(() => "");
    throw new Error(
      `claude -p produced no output (exit ${exitCode})${
        errText ? `: ${errText.slice(0, 300)}` : " — likely killed by timeout"
      }`,
    );
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error(
      `claude -p output was not JSON (exit ${exitCode}): ${stdout.slice(0, 300)}`,
    );
  }

  const isError = envelope.is_error === true;
  const apiErrorStatus =
    typeof envelope.api_error_status === "number"
      ? (envelope.api_error_status as number)
      : null;
  const raw = typeof envelope.result === "string" ? envelope.result : "";

  return {
    raw,
    isError,
    apiErrorStatus,
    isTransient:
      apiErrorStatus != null && TRANSIENT_API_STATUSES.has(apiErrorStatus),
    isUsageLimit: isError && apiErrorStatus == null && looksLikeUsageLimit(raw),
    usage: envelope.usage as ClaudeTranslateResult["usage"],
    sessionId:
      typeof envelope.session_id === "string"
        ? (envelope.session_id as string)
        : undefined,
    durationMs:
      typeof envelope.duration_ms === "number"
        ? (envelope.duration_ms as number)
        : undefined,
    envelope,
  };
}

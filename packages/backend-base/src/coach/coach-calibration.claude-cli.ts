import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type {
  AiChatOptions,
  AiChatResponse,
  AiProvider,
} from "../shared/ai/ai-provider.interface";
import {
  formatCalibration,
  handScoredCorpus,
  runCalibration,
} from "./coach-calibration.runner";

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

function claudeChildEnv(
  parent: Record<string, string | undefined>,
): Record<string, string> {
  return { PATH: parent.PATH ?? "", HOME: parent.HOME ?? "" };
}

export function claudeCli(model: string): AiProvider {
  let calls = 0;
  return {
    name: "claude-cli",
    async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
      const system = opts.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const user = opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => m.content)
        .join("\n\n");
      calls += 1;
      const started = Date.now();
      const proc = Bun.spawn(
        [
          "claude",
          "-p",
          "--model",
          model,
          "--output-format",
          "json",
          "--system-prompt",
          `${system}\n\nRespond with the JSON object only, no prose and no code fence.`,
          "--tools",
          "",
          "--no-session-persistence",
          "--strict-mcp-config",
          "--setting-sources",
          "",
        ],
        {
          stdin: new Blob([user]),
          stdout: "pipe",
          stderr: "pipe",
          env: claudeChildEnv(process.env),
        },
      );
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (code !== 0) {
        throw new Error(`claude -p exited ${code}: ${err.slice(0, 500)}`);
      }
      const envelope = JSON.parse(out) as {
        result?: string;
        is_error?: boolean;
        modelUsage?: Record<string, unknown>;
      };
      if (envelope.is_error || typeof envelope.result !== "string") {
        throw new Error(`claude -p returned an error: ${out.slice(0, 500)}`);
      }
      const served = Object.keys(envelope.modelUsage ?? {});
      if (!served.includes(model)) {
        throw new Error(`expected ${model}, served by ${served.join(", ")}`);
      }
      console.error(
        `call ${calls}: ${Math.round((Date.now() - started) / 1000)}s on ${served.join(", ")}`,
      );
      return { content: stripFences(envelope.result), model };
    },
    async responsesCreate() {
      throw new Error("not used by calibration");
    },
    async filesCreate() {
      throw new Error("not used by calibration");
    },
    async filesRetrieve() {
      throw new Error("not used by calibration");
    },
    async filesContent() {
      throw new Error("not used by calibration");
    },
    async batchesCreate() {
      throw new Error("not used by calibration");
    },
    async batchesRetrieve() {
      throw new Error("not used by calibration");
    },
    async batchesCancel() {
      throw new Error("not used by calibration");
    },
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      transcripts: { type: "string" },
      model: { type: "string", default: "claude-opus-5-5" },
      limit: { type: "string" },
      "yes-transcripts-leave-this-machine": { type: "boolean", default: false },
    },
  });
  if (!values.transcripts) {
    console.error(
      "usage: bun run coach:calibrate:claude --transcripts <dir> --yes-transcripts-leave-this-machine [--model <id>] [--limit <n>]",
    );
    process.exit(2);
  }
  const transcriptsDir = values.transcripts;
  const model = values.model ?? "claude-opus-5-5";

  if (process.env.ANTHROPIC_API_KEY)
    console.error(
      "ANTHROPIC_API_KEY is set in this environment. It is not passed to claude, which scores on the local login only.",
    );
  console.error(
    `Scoring with ${model} through this machine's local \`claude\` login: every transcript scored is sent to that account, so the transcripts leave this machine.`,
  );
  if (!values["yes-transcripts-leave-this-machine"]) {
    console.error(
      "Refused: rerun with --yes-transcripts-leave-this-machine to send them.",
    );
    process.exit(2);
  }

  const { db: Database } = await import("database");
  const { CoachScoringService } = await import("./coach-scoring.service");

  const corpus = (await handScoredCorpus(Database)).filter(
    (r) =>
      existsSync(join(transcriptsDir, `${r.reportId}.txt`)) ||
      existsSync(join(transcriptsDir, `${r.reportId}.json`)),
  );
  console.error(`hand-scored reports with a transcript: ${corpus.length}`);

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const result = await runCalibration(
    {
      db: Database,
      scoring: new CoachScoringService(Database, claudeCli(model), model),
      transcriptsDir,
      corpus,
    },
    { limit, dryRun: true },
  );
  console.log(formatCalibration(result));
  process.exit(0);
}

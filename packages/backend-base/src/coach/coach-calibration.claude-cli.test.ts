import { afterAll, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "coach-calibration.claude-cli.ts");
const scratch = mkdtempSync(join(tmpdir(), "coach-claude-cli-"));
const transcripts = join(scratch, "transcripts");
const bin = join(scratch, "bin");
const called = join(scratch, "claude-was-called");
for (const dir of [transcripts, bin]) mkdirSync(dir, { recursive: true });
writeFileSync(join(bin, "claude"), `#!/bin/sh\ntouch "${called}"\nexit 1\n`);
chmodSync(join(bin, "claude"), 0o755);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(...flags: string[]) {
  const proc = Bun.spawnSync(
    [
      "bun",
      CLI,
      "--transcripts",
      transcripts,
      "--model",
      "claude-test-model",
      ...flags,
    ],
    {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  return { code: proc.exitCode, stderr: proc.stderr.toString() };
}

describe("the Claude CLI calibration tells the operator where transcripts go", () => {
  it("without the operator's flag it names the model and the local login, refuses, and sends nothing", () => {
    const { code, stderr } = run();
    expect(code).toBe(2);
    expect(stderr).toContain("claude-test-model");
    expect(stderr).toContain("local `claude` login");
    expect(stderr).toContain("leave this machine");
    expect(stderr).toContain("--yes-transcripts-leave-this-machine");
    expect(existsSync(called)).toBe(false);
  });

  it("with the flag the notice is printed before any scoring starts", () => {
    const { stderr } = run("--yes-transcripts-leave-this-machine");
    const notice = stderr.indexOf("leave this machine");
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(stderr).not.toContain("rerun with");
    const scoring = stderr.indexOf("hand-scored reports with a transcript");
    expect(scoring).toBeGreaterThan(notice);
  });
});

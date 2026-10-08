import { afterAll, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

describe("the claude child sees only PATH, HOME and what locates the local login", () => {
  const childBin = join(scratch, "child-bin");
  const envDump = join(scratch, "child-env");
  mkdirSync(childBin, { recursive: true });
  writeFileSync(
    join(childBin, "claude"),
    `#!/bin/sh\nenv > "${envDump}"\ncat > /dev/null\nprintf '%s' '{"result":"{}","modelUsage":{"claude-test-model":{}}}'\n`,
  );
  chmodSync(join(childBin, "claude"), 0o755);

  it("a secret in the calibration's own environment never reaches the child", async () => {
    const { claudeCli } = await import("./coach-calibration.claude-cli");
    const saved = { ...process.env };
    process.env.PATH = `${childBin}:${saved.PATH}`;
    process.env.ANTHROPIC_API_KEY = "sk-test-not-a-key";
    process.env.ANTHROPIC_AUTH_TOKEN = "bearer-test-not-a-token";
    process.env.DATABASE_URL = "postgres://secret@db.example.test/x";
    process.env.CLAUDE_CONFIG_DIR = join(scratch, "claude-config");
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-not-a-token";
    try {
      await claudeCli("claude-test-model").chatComplete({
        model: "claude-test-model",
        messages: [{ role: "user", content: "score this" }],
      });
    } finally {
      for (const key of Object.keys(process.env))
        if (!(key in saved)) Reflect.deleteProperty(process.env, key);
      Object.assign(process.env, saved);
    }
    const lines = readFileSync(envDump, "utf8").split("\n").filter(Boolean);
    const names = lines.map((line) => line.split("=")[0]);
    expect(names).toContain("PATH");
    expect(names).toContain("HOME");
    expect(lines).toContain(
      `CLAUDE_CONFIG_DIR=${join(scratch, "claude-config")}`,
    );
    expect(lines).toContain("CLAUDE_CODE_OAUTH_TOKEN=oauth-test-not-a-token");
    expect(names).not.toContain("ANTHROPIC_API_KEY");
    expect(names).not.toContain("ANTHROPIC_AUTH_TOKEN");
    expect(names).not.toContain("DATABASE_URL");
    expect(
      names.filter(
        (n) =>
          ![
            "PATH",
            "HOME",
            "CLAUDE_CONFIG_DIR",
            "CLAUDE_CODE_OAUTH_TOKEN",
            "PWD",
            "SHLVL",
            "_",
          ].includes(n),
      ),
    ).toEqual([]);
  });

  it("an ANTHROPIC_API_KEY in the environment is named before anything is scored", () => {
    const proc = Bun.spawnSync(
      [
        "bun",
        CLI,
        "--transcripts",
        transcripts,
        "--model",
        "claude-test-model",
      ],
      {
        cwd: join(import.meta.dir, "../.."),
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          ANTHROPIC_API_KEY: "sk-test-not-a-key",
        },
      },
    );
    const stderr = proc.stderr.toString();
    expect(stderr).toContain("ANTHROPIC_API_KEY is set");
    expect(stderr).not.toContain("sk-test-not-a-key");
  });
});

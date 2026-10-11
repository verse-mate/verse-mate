import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { signingSecret } from "./signing-secret";

const repo = join(import.meta.dir, "../../../..");
const plugin = join(import.meta.dir, "shared.plugin.ts");

const exampleSecrets = [
  "apps/backend/.env.example",
  "packages/backend-base/.env.example",
  "packages/database/.env.example",
].map((file) => {
  const line = readFileSync(join(repo, file), "utf8")
    .split("\n")
    .find((l) => l.startsWith("AUTH_ACCESS_TOKEN_SECRET="));
  return (line ?? "").slice("AUTH_ACCESS_TOKEN_SECRET=".length).trim();
});

function start(environment: string, secret: string) {
  const run = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `await import(${JSON.stringify(plugin)}); process.exit(0);`,
    ],
    {
      env: {
        ...process.env,
        ENVIRONMENT: environment,
        AUTH_ACCESS_TOKEN_SECRET: secret,
      },
      cwd: join(import.meta.dir, "../.."),
    },
  );
  const stderr = run.stderr.toString();
  const reason =
    stderr.split("\n").find((line) => line.startsWith("error:")) ?? "";
  return { exitCode: run.exitCode, reason };
}

const unique = "k3Jv9qXbT2mWz8LpR5cN1yHd7FgA4sEu";

describe("the session signing secret at startup", () => {
  it("every example settings file names a secret", () => {
    expect(exampleSecrets).toHaveLength(3);
    for (const secret of exampleSecrets)
      expect(secret.length).toBeGreaterThan(0);
  });

  for (const secret of [...new Set(exampleSecrets), "my-super-secret"])
    it(`production refuses to start with the published example value (${secret.length} characters)`, () => {
      const { exitCode, reason } = start("production", secret);
      expect(exitCode).not.toBe(0);
      expect(reason).toContain("AUTH_ACCESS_TOKEN_SECRET");
      expect(reason).not.toContain(secret);
    });

  it("production refuses a secret shorter than 32 characters", () => {
    const short = unique.slice(0, 31);
    const { exitCode, reason } = start("production", short);
    expect(exitCode).not.toBe(0);
    expect(reason).toContain("AUTH_ACCESS_TOKEN_SECRET");
    expect(reason).not.toContain(short);
  });

  it("production starts with a unique secret of 32 characters", () => {
    expect(start("production", unique).exitCode).toBe(0);
  });

  it("development and tests keep starting with a short or example secret", () => {
    for (const environment of ["development", "test"])
      for (const secret of ["test-secret", ...exampleSecrets])
        expect(start(environment, secret).exitCode).toBe(0);
  });
});

describe("the signing secret rule", () => {
  const production = (secret: string) => () =>
    signingSecret({
      ENVIRONMENT: "production",
      AUTH_ACCESS_TOKEN_SECRET: secret,
    });

  it("padding does not lengthen a secret", () => {
    expect(production(" ".repeat(40))).toThrow("AUTH_ACCESS_TOKEN_SECRET");
    expect(production(`${unique.slice(0, 20)}${" ".repeat(20)}`)).toThrow(
      "AUTH_ACCESS_TOKEN_SECRET",
    );
  });

  it("every published example value is refused in production, padded or not", () => {
    for (const secret of exampleSecrets) {
      expect(production(secret)).toThrow("AUTH_ACCESS_TOKEN_SECRET");
      expect(production(`  ${secret.padEnd(40)}`)).toThrow(
        "AUTH_ACCESS_TOKEN_SECRET",
      );
    }
  });

  it("a long secret is returned exactly as configured", () => {
    expect(production(`  ${unique}  `)()).toBe(`  ${unique}  `);
  });

  it("the old public default is refused everywhere, padded or not", () => {
    for (const ENVIRONMENT of ["development", "test", "production"])
      expect(() =>
        signingSecret({
          ENVIRONMENT,
          AUTH_ACCESS_TOKEN_SECRET: "my-super-secret\n",
        }),
      ).toThrow("AUTH_ACCESS_TOKEN_SECRET");
  });

  it("only production applies the length rule", () => {
    for (const ENVIRONMENT of ["development", "test", "staging", undefined])
      expect(
        signingSecret({ ENVIRONMENT, AUTH_ACCESS_TOKEN_SECRET: "test-secret" }),
      ).toBe("test-secret");
  });
});

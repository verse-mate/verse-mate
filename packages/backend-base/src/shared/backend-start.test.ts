import { describe, expect, it } from "bun:test";
import path from "node:path";

import { configuredRedisUrl } from "./redis-url";

const ENTRY = path.join(
  import.meta.dir,
  "../../../../apps/backend/src/index.ts",
);
const STARTED_TIMEOUT_MS = 60_000;

function isolatedRedisUrl(): string {
  const url = new URL(configuredRedisUrl());
  url.pathname = "/15";
  return url.toString();
}

async function startBackend(role: string, readyLine: string) {
  const port = 40_000 + Math.floor(Math.random() * 20_000);
  const proc = Bun.spawn(["bun", ENTRY], {
    env: {
      ...process.env,
      VERSEMATE_ROLE: role,
      PORT: String(port),
      REDIS_URL: isolatedRedisUrl(),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let stdout = "";
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + STARTED_TIMEOUT_MS;
  try {
    while (!stdout.includes(readyLine) && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      stdout += decoder.decode(value);
    }
    const health = stdout.includes(readyLine)
      ? (await fetch(`http://localhost:${port}/health`)).status
      : undefined;
    return { stdout, health };
  } finally {
    proc.kill();
    await proc.exited;
  }
}

describe("the backend starts the work its role owns", () => {
  it("an unrecognised role exits 1 before it listens or starts a worker", async () => {
    const proc = Bun.spawn(["bun", ENTRY], {
      env: { ...process.env, VERSEMATE_ROLE: "wroker", PORT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(1);
    const stdout = await new Response(proc.stdout).text();
    expect(await new Response(proc.stderr).text()).toContain('"wroker"');
    expect(stdout).not.toContain("Elysia is running");
    expect(stdout).not.toContain("[QUEUE] Starting");
  }, 30_000);

  it("the API refreshes the language statistics and starts no worker", async () => {
    const { stdout, health } = await startBackend(
      "api",
      "Triggering initial language stats refresh",
    );
    expect(health).toBe(200);
    expect(stdout).toContain(
      "[QUEUE] No BullMQ workers in this process (role: api)",
    );
    expect(stdout).not.toContain("worker started successfully");
  }, 90_000);

  it("the worker starts every worker, answers its health check and skips the API's start-up", async () => {
    const { stdout, health } = await startBackend(
      "worker",
      "[QUEUE] Coach Monday reminder worker started successfully",
    );
    expect(health).toBe(200);
    expect(stdout).toContain("[QUEUE] Starting BullMQ workers (role: worker)");
    expect(stdout).not.toContain("language stats");
  }, 90_000);
});

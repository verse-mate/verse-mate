import { describe, expect, it } from "bun:test";

import { QUEUE_WORKERS, startQueueWorkers } from "./shared.plugin";
import type { WorkerRole } from "./worker-role";

const MEDIA = ["Audio generation", "Audio cleanup", "Coach intake"];
const API = [
  "Monitoring",
  "Processing",
  "Verse notification",
  "Coach reminder",
  "Coach monthly",
];

async function startAs(role: WorkerRole) {
  const ran: string[] = [];
  const crons: string[] = [];
  await startQueueWorkers(
    role,
    QUEUE_WORKERS.map((entry) => ({
      ...entry,
      worker: {
        isRunning: () => false,
        run: () => {
          ran.push(entry.name);
        },
      },
      registerCron: entry.registerCron
        ? async () => {
            crons.push(entry.name);
          }
        : undefined,
    })),
  );
  return { ran, crons };
}

describe("the container starts only the workers its role owns", () => {
  it("the API container starts no media worker and schedules no media cron", async () => {
    const { ran, crons } = await startAs("api");
    expect(ran.sort()).toEqual([...API].sort());
    expect(crons).toEqual([
      "Verse notification",
      "Coach reminder",
      "Coach monthly",
    ]);
  });

  it("the media container starts only the media workers and their crons", async () => {
    const { ran, crons } = await startAs("media-worker");
    expect(ran.sort()).toEqual([...MEDIA].sort());
    expect(crons.sort()).toEqual(["Audio cleanup", "Coach intake"]);
  });

  it("a single container runs every worker and every cron", async () => {
    const { ran, crons } = await startAs("all");
    expect(ran.sort()).toEqual([...API, ...MEDIA].sort());
    expect(crons.sort()).toEqual(
      [
        "Audio cleanup",
        "Coach intake",
        "Verse notification",
        "Coach reminder",
        "Coach monthly",
      ].sort(),
    );
  });

  it("a worker already running is not started twice", async () => {
    let runs = 0;
    await startQueueWorkers("all", [
      {
        name: "Coach intake",
        side: "media",
        worker: {
          isRunning: () => true,
          run: () => {
            runs += 1;
          },
        },
      },
    ]);
    expect(runs).toBe(0);
  });

  it("a cron that fails to register does not stop the workers after it", async () => {
    const ran: string[] = [];
    await startQueueWorkers("all", [
      {
        name: "First",
        side: "media",
        worker: { isRunning: () => false, run: () => ran.push("First") },
        registerCron: async () => {
          throw new Error("redis down");
        },
      },
      {
        name: "Second",
        side: "api",
        worker: { isRunning: () => false, run: () => ran.push("Second") },
      },
    ]);
    expect(ran).toEqual(["First", "Second"]);
  });
});

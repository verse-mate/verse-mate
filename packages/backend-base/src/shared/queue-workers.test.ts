import { describe, expect, it } from "bun:test";

import {
  QUEUE_WORKERS,
  startBackgroundWork,
  startQueueWorkers,
} from "./shared.plugin";
import type { WorkerRole } from "./worker-role";

const ALL_WORKERS = [
  "Monitoring",
  "Processing",
  "Audio generation",
  "Audio cleanup",
  "Verse notification",
  "Coach intake",
  "Coach reminder",
  "Coach monthly",
  "Coach Monday reminder",
];
const ALL_CRONS = [
  "Audio cleanup",
  "Verse notification",
  "Coach intake",
  "Coach reminder",
  "Coach monthly",
  "Coach Monday reminder",
];

async function startAs(role: WorkerRole) {
  const ran: string[] = [];
  const crons: string[] = [];
  await startBackgroundWork(role, {
    startWorkers: () =>
      startQueueWorkers(
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
      ),
  });
  return { ran: ran.sort(), crons: crons.sort() };
}

describe("the container starts only the workers its role owns", () => {
  it("the API container starts no worker and schedules no cron", async () => {
    expect(await startAs("api")).toEqual({ ran: [], crons: [] });
  });

  it("the worker container starts all nine workers and all six crons", async () => {
    expect(await startAs("worker")).toEqual({
      ran: [...ALL_WORKERS].sort(),
      crons: [...ALL_CRONS].sort(),
    });
  });

  it("a single container runs every worker and every cron", async () => {
    expect(await startAs("all")).toEqual({
      ran: [...ALL_WORKERS].sort(),
      crons: [...ALL_CRONS].sort(),
    });
  });

  it("a worker already running is not started twice", async () => {
    let runs = 0;
    await startQueueWorkers([
      {
        name: "Coach intake",
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
    await startQueueWorkers([
      {
        name: "First",
        worker: { isRunning: () => false, run: () => ran.push("First") },
        registerCron: async () => {
          throw new Error("redis down");
        },
      },
      {
        name: "Second",
        worker: { isRunning: () => false, run: () => ran.push("Second") },
      },
    ]);
    expect(ran).toEqual(["First", "Second"]);
  });
});

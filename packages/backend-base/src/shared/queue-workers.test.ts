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
    waitForMigrations: async () => {},
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
    resumeBatchMonitoring: async () => {},
  });
  return { ran: ran.sort(), crons: crons.sort() };
}

describe("start-up work that queues jobs runs with the workers", () => {
  async function scansAs(role: WorkerRole) {
    let scans = 0;
    await startBackgroundWork(role, {
      waitForMigrations: async () => {},
      startWorkers: async () => {},
      resumeBatchMonitoring: async () => {
        scans += 1;
      },
    });
    return scans;
  }

  it("re-queues monitoring for active batches in the worker and a single container", async () => {
    expect(await scansAs("worker")).toBe(1);
    expect(await scansAs("all")).toBe(1);
  });

  it("the API container does not re-queue batch monitoring", async () => {
    expect(await scansAs("api")).toBe(0);
  });
});

describe("the container starts only the workers its role owns", () => {
  it("no worker runs before its role starts it", () => {
    // Asserted on the construction, not on isRunning(): bun runs every test file in one process,
    // and a test that calls app.listen() fires the shared plugin's onStart, which starts every
    // worker. Whether those are still running when this file runs depends on file order.
    const autostarting = QUEUE_WORKERS.filter(
      (entry) =>
        (entry.worker as { opts?: { autorun?: boolean } }).opts?.autorun !==
        false,
    );
    expect(autostarting.map((entry) => entry.name)).toEqual([]);
  });

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

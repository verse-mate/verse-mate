import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, sql } from "database";

import { imageMigrator, waitForMigrations } from "./migration-wait";
import { startBackgroundWork } from "./shared.plugin";

const TABLE = `migration_wait_test_${process.pid}`;
let folder: string;
const connection = db.getOrCreateConnection();
const migrator = () => imageMigrator(connection, folder, TABLE);

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "migration-wait-"));
  await writeFile(
    path.join(folder, "20990101000000-noop.js"),
    "export async function up() {}\nexport async function down() {}\n",
  );
});

async function dropMigrationTables() {
  await sql`drop table if exists ${sql.table(TABLE)}`.execute(connection);
  await sql`drop table if exists ${sql.table(`${TABLE}_lock`)}`.execute(
    connection,
  );
}

afterAll(async () => {
  await dropMigrationTables();
  await rm(folder, { recursive: true, force: true });
});

describe("the worker starts no job before the deploy's migrations", () => {
  it("waits while a migration is pending, then starts its workers", async () => {
    const logs: string[] = [];
    const log = spyOn(console, "log").mockImplementation((line: string) => {
      logs.push(line);
    });
    let started = false;
    const running = startBackgroundWork("worker", {
      waitForMigrations: () =>
        waitForMigrations(migrator(), { intervalMs: 20, timeoutMs: 10_000 }),
      startWorkers: async () => {
        started = true;
      },
      resumeBatchMonitoring: async () => {},
    });

    for (let i = 0; i < 100 && logs.length === 0; i++) await Bun.sleep(50);
    expect(started).toBe(false);
    expect(logs).toContain("[QUEUE] waiting for 1 pending migration(s)");

    const { error } = await migrator().migrateToLatest();
    expect(error).toBeUndefined();
    await running;
    log.mockRestore();
    expect(started).toBe(true);
  });

  it("gives up after the time limit without starting a worker", async () => {
    await dropMigrationTables();
    let started = false;
    const running = startBackgroundWork("worker", {
      waitForMigrations: () =>
        waitForMigrations(migrator(), { intervalMs: 20, timeoutMs: 300 }),
      startWorkers: async () => {
        started = true;
      },
      resumeBatchMonitoring: async () => {},
    });
    await expect(running).rejects.toThrow("1 migration(s) still pending");
    expect(started).toBe(false);
  });

  it("the single container and the API do not wait", async () => {
    let waits = 0;
    for (const role of ["all", "api"] as const) {
      await startBackgroundWork(role, {
        waitForMigrations: async () => {
          waits += 1;
        },
        startWorkers: async () => {},
        resumeBatchMonitoring: async () => {},
      });
    }
    expect(waits).toBe(0);
  });
});

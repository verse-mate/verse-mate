import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MIGRATIONS_DIR, db, sql } from "database";
import type { MigrationInfo } from "kysely";

import { imageMigrator, waitForMigrations } from "./migration-wait";
import { startBackgroundWork } from "./shared.plugin";

const TABLE = `migration_wait_test_${process.pid}`;
let folder: string;
const connection = db.getOrCreateConnection();
const migrator = () => imageMigrator(connection, folder, TABLE);

async function dropMigrationTables() {
  await sql`drop table if exists ${sql.table(TABLE)}`.execute(connection);
  await sql`drop table if exists ${sql.table(`${TABLE}_lock`)}`.execute(
    connection,
  );
}

function workerStart(waitForMigrationsStep: () => Promise<void>) {
  const seen = { started: false, scanned: false };
  const running = startBackgroundWork("worker", {
    waitForMigrations: waitForMigrationsStep,
    startWorkers: async () => {
      seen.started = true;
    },
    resumeBatchMonitoring: async () => {
      seen.scanned = true;
    },
  });
  return { running, seen };
}

async function quietly(run: () => Promise<unknown>): Promise<void> {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await run();
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "migration-wait-"));
  await writeFile(
    path.join(folder, "20990101000000-noop.js"),
    "export async function up() {}\nexport async function down() {}\n",
  );
});

afterAll(async () => {
  await dropMigrationTables();
  await rm(folder, { recursive: true, force: true });
});

describe("the worker starts no job before the deploy's migrations", () => {
  it("waits while a migration is pending, then starts its workers", async () => {
    await dropMigrationTables();
    const logs: string[] = [];
    const log = spyOn(console, "log").mockImplementation((line: string) => {
      logs.push(line);
    });
    try {
      const { running, seen } = workerStart(() =>
        waitForMigrations(migrator(), { intervalMs: 20, timeoutMs: 10_000 }),
      );
      for (let i = 0; i < 100 && logs.length === 0; i++) await Bun.sleep(50);
      expect(seen).toEqual({ started: false, scanned: false });
      expect(logs).toContain("[QUEUE] waiting for 1 pending migration(s)");

      const { error } = await migrator().migrateToLatest();
      expect(error).toBeUndefined();
      await running;
      expect(seen).toEqual({ started: true, scanned: true });
    } finally {
      log.mockRestore();
    }
  });

  it("gives up after the time limit without starting a worker", async () => {
    await dropMigrationTables();
    const { running, seen } = workerStart(() =>
      waitForMigrations(migrator(), { intervalMs: 20, timeoutMs: 1_000 }),
    );
    await quietly(async () =>
      expect(running).rejects.toThrow("migration(s) still pending"),
    );
    expect(seen).toEqual({ started: false, scanned: false });
  });

  it("an unreadable database never counts as nothing pending", async () => {
    let reads = 0;
    const flaky = {
      getMigrations: async (): Promise<MigrationInfo[]> => {
        reads += 1;
        if (reads <= 3) throw new Error("connection refused");
        return [];
      },
    };
    const { running, seen } = workerStart(() =>
      waitForMigrations(flaky, { intervalMs: 10, timeoutMs: 5_000 }),
    );
    await quietly(() => running);
    expect(reads).toBe(4);
    expect(seen.started).toBe(true);

    const down = {
      getMigrations: async (): Promise<MigrationInfo[]> => {
        throw new Error("connection refused");
      },
    };
    const stuck = workerStart(() =>
      waitForMigrations(down, { intervalMs: 10, timeoutMs: 100 }),
    );
    await quietly(async () =>
      expect(stuck.running).rejects.toThrow(
        "unknown migration(s) still pending",
      ),
    );
    expect(stuck.seen.started).toBe(false);
  });

  it("a read that hangs still ends at the time limit", async () => {
    const hung = {
      getMigrations: () => new Promise<MigrationInfo[]>(() => {}),
    };
    await quietly(async () =>
      expect(
        waitForMigrations(hung, { intervalMs: 10, timeoutMs: 100 }),
      ).rejects.toThrow("still pending"),
    );
  });

  it("a missing migration folder fails at once instead of waiting", async () => {
    const missing = imageMigrator(
      connection,
      path.join(folder, "does-not-exist"),
      TABLE,
    );
    await expect(
      waitForMigrations(missing, { intervalMs: 10, timeoutMs: 10_000 }),
    ).rejects.toThrow("ENOENT");
  });

  it("the default folder is the one the migrator deploys", async () => {
    const files = await readdir(MIGRATIONS_DIR);
    expect(files.some((file) => /^\d{14}-.+\.ts$/.test(file))).toBe(true);
  });

  it("a database ahead of the image, as after a rollback, has nothing pending", async () => {
    await dropMigrationTables();
    await migrator().migrateToLatest();
    await sql`insert into ${sql.table(TABLE)} (name, timestamp) values ('20991231000000-newer', now()::text)`.execute(
      connection,
    );
    await waitForMigrations(migrator(), { intervalMs: 10, timeoutMs: 1_000 });
  });

  it("a single container does not wait", async () => {
    let waits = 0;
    await quietly(() =>
      startBackgroundWork("all", {
        waitForMigrations: async () => {
          waits += 1;
        },
        startWorkers: async () => {},
        resumeBatchMonitoring: async () => {},
      }),
    );
    expect(waits).toBe(0);
  });
});

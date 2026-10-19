import { promises as fs } from "node:fs";
import path from "node:path";
import type { db } from "database";
import { FileMigrationProvider, type Kysely, Migrator } from "kysely";

const INTERVAL_MS = 5_000;
const TIMEOUT_MS = 15 * 60_000;

export function imageMigrator(
  connection: ReturnType<typeof db.getOrCreateConnection>,
  migrationFolder = path.join(import.meta.dir, "../migrations"),
  migrationTableName?: string,
): Migrator {
  return new Migrator({
    db: connection as unknown as Kysely<unknown>,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    ...(migrationTableName && {
      migrationTableName,
      migrationLockTableName: `${migrationTableName}_lock`,
    }),
  });
}

async function pendingCount(migrator: Migrator): Promise<number | undefined> {
  try {
    const migrations = await migrator.getMigrations();
    return migrations.filter((migration) => !migration.executedAt).length;
  } catch (error) {
    console.error("[QUEUE] Could not read the migrations:", error);
    return undefined;
  }
}

export async function waitForMigrations(
  migrator: Migrator,
  { intervalMs = INTERVAL_MS, timeoutMs = TIMEOUT_MS } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pending = await pendingCount(migrator);
    if (pending === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `[QUEUE] ${pending ?? "unknown"} migration(s) still pending after ${timeoutMs} ms; exiting`,
      );
    }
    if (pending !== undefined)
      console.log(`[QUEUE] waiting for ${pending} pending migration(s)`);
    await Bun.sleep(intervalMs);
  }
}

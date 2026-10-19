import { promises as fs } from "node:fs";
import path from "node:path";
import { MIGRATIONS_DIR, type db } from "database";
import { FileMigrationProvider, type Kysely, Migrator } from "kysely";

const INTERVAL_MS = 5_000;
const TIMEOUT_MS = 15 * 60_000;

type PendingSource = Pick<Migrator, "getMigrations">;

export function imageMigrator(
  connection: ReturnType<typeof db.getOrCreateConnection>,
  migrationFolder = MIGRATIONS_DIR,
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

async function pendingCount(
  migrator: PendingSource,
  timeLeftMs: number,
): Promise<number | undefined> {
  let timer: Timer | undefined;
  try {
    const migrations = await Promise.race([
      migrator.getMigrations(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("the read timed out")),
          Math.max(timeLeftMs, 0),
        );
      }),
    ]);
    return migrations.filter((migration) => !migration.executedAt).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
    console.error(
      `[QUEUE] Could not read the migrations: ${(error as Error).message}`,
    );
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForMigrations(
  migrator: PendingSource,
  { intervalMs = INTERVAL_MS, timeoutMs = TIMEOUT_MS } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pending = await pendingCount(migrator, deadline - Date.now());
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

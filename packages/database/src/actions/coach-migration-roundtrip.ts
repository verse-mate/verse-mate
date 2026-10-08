import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  FileMigrationProvider,
  Kysely,
  type MigrationResultSet,
  Migrator,
  PostgresDialect,
  sql,
} from "kysely";
import { Pool } from "pg";

import { getCleanConnectionString, getSSLConfig } from "../utils/ssl-config";

const MIGRATIONS = path.join(import.meta.dir, "../../migrations");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function connect(url: URL): Kysely<unknown> {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url.toString(), ssl: getSSLConfig() }),
    }),
  });
}

function settled(step: string, outcome: MigrationResultSet): void {
  for (const r of outcome.results ?? [])
    if (r.status === "Error")
      console.error(`${step}: ${r.migrationName} failed`);
  if (outcome.error) throw outcome.error;
}

async function schemaDump(db: Kysely<unknown>): Promise<string> {
  const sections = {
    columns: sql`
      SELECT table_name, column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, column_name`,
    constraints: sql`
      SELECT c.conrelid::regclass::text AS table_name, c.conname,
             pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' ORDER BY 1, 2`,
    indexes: sql`
      SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' ORDER BY 1, 2`,
    triggers: sql`
      SELECT tgrelid::regclass::text AS table_name, tgname,
             pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t WHERE NOT tgisinternal ORDER BY 1, 2`,
    functions: sql`
      SELECT p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY 1, 2`,
  };
  const dump: Record<string, unknown[]> = {};
  for (const [name, query] of Object.entries(sections))
    dump[name] = (await query.execute(db)).rows;
  return JSON.stringify(dump, null, 1);
}

function firstDifference(a: string, b: string): string {
  const left = a.split("\n");
  const right = b.split("\n");
  const at = left.findIndex((line, i) => line !== right[i]);
  return `line ${at + 1}:\n  before: ${left[at]}\n  after:  ${right[at]}`;
}

async function roundTrip(): Promise<boolean> {
  const configured = new URL(getCleanConnectionString());
  if (!LOCAL_HOSTS.has(configured.hostname))
    throw new Error(
      `refusing to create a throwaway database on ${configured.hostname}: POSTGRES_URL must point at a local server`,
    );
  const throwaway = `coach_roundtrip_${Date.now()}_${process.pid}`;
  const maintenanceUrl = new URL(configured);
  maintenanceUrl.pathname = "/postgres";
  const throwawayUrl = new URL(configured);
  throwawayUrl.pathname = `/${throwaway}`;

  const maintenance = connect(maintenanceUrl);
  await sql`CREATE DATABASE ${sql.id(throwaway)}`.execute(maintenance);
  console.log(`created ${throwaway}`);
  const db = connect(throwawayUrl);
  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: MIGRATIONS,
      }),
    });
    const names = (await migrator.getMigrations()).map((m) => m.name);
    const lastOther = names.findLastIndex((n) => !/coach/i.test(n));
    const block = names.slice(lastOther + 1);
    console.log(
      `coach block: ${block.length} migrations, ${block[0]} .. ${block.at(-1)}`,
    );

    settled("up", await migrator.migrateToLatest());
    const before = await schemaDump(db);
    settled("down", await migrator.migrateTo(names[lastOther]));
    settled("up again", await migrator.migrateToLatest());
    const after = await schemaDump(db);

    if (before === after) {
      console.log("schema after up, down and up matches the first up");
      return true;
    }
    console.error(
      `schema differs after the round trip, ${firstDifference(before, after)}`,
    );
    return false;
  } finally {
    await db.destroy();
    await sql`DROP DATABASE IF EXISTS ${sql.id(throwaway)} WITH (FORCE)`.execute(
      maintenance,
    );
    await maintenance.destroy();
    console.log(`dropped ${throwaway}`);
  }
}

roundTrip().then(
  (same) => process.exit(same ? 0 : 1),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

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

import { DISCARD_FLAG } from "../../migrations/20260825120000-create-coach-reports-store";
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

const SESSION = `INSERT INTO coach_intake_sessions (source_session_id, session_date) VALUES ('roundtrip', '2026-01-01')`;
const REPORT = `INSERT INTO coach_reports (id, coach_id, session_date, source_session_id, summary, metrics, body) VALUES ('roundtrip', 'roundtrip', '2026-01-01', 'roundtrip', '{}', '{}', '{}')`;
const AMENDMENT =
  "INSERT INTO coach_report_amendments (report_id, revision, previous, changes";
const RUN =
  "INSERT INTO coach_calibration_runs (model_version, composite_mae, dimensions_within_one, comparisons, reports";
const sessionWith = (set: string) =>
  `${SESSION}; UPDATE coach_intake_sessions SET ${set}`;
const reportWith = (set: string) =>
  `${REPORT}; UPDATE coach_reports SET ${set}`;

type Refusal = {
  seed: string;
  tables: string[];
  rewrites?: true;
};

const REFUSALS: Record<string, Refusal> = {
  "20260901157000-coach-leader-email-requests": {
    seed: "INSERT INTO coach_leader_email_requests (slug, new_email, token_hash, expires_at) VALUES ('roundtrip', 'after@example.test', 'h', now())",
    tables: ["coach_leader_email_requests"],
  },
  "20260901156000-coach-machine-score": {
    seed: `${REPORT}; INSERT INTO coach_report_dimension_scores (report_id, dimension_n, provenance, score, machine_score) VALUES ('roundtrip', 1, 'human', 2, 4)`,
    tables: ["coach_reports"],
  },
  "20260901155000-coach-score-produced-by": {
    seed: `${REPORT}; INSERT INTO coach_report_dimension_scores (report_id, dimension_n, provenance, prompt_version) VALUES ('roundtrip', 1, 'machine', 'p1')`,
    tables: ["coach_reports"],
  },
  "20260901153000-coach-intake-send-unconfirmed": {
    seed: sessionWith("send_unconfirmed = true"),
    tables: ["coach_intake_sessions"],
  },
  "20260901152000-coach-intake-hold-kind": {
    seed: sessionWith("hold_kind = 'review'"),
    tables: ["coach_intake_sessions"],
  },
  "20260901151000-coach-intake-session-start": {
    seed: sessionWith("session_started_at = now()"),
    tables: ["coach_intake_sessions"],
  },
  "20260901150000-coach-intake-parallel-run": {
    seed: sessionWith("parallel_run = true"),
    tables: ["coach_intake_sessions"],
  },
  "20260901149000-coach-revision-attempted": {
    seed: `${REPORT}; ${AMENDMENT}, coach_id, attempted_to) VALUES ('roundtrip', 1, '{}', '{}', 'roundtrip', '{reader@example.test}')`,
    tables: ["coach_reports"],
  },
  "20260901148000-coach-delivery-attempted": {
    seed: sessionWith("attempted_to = '{reader@example.test}'"),
    tables: ["coach_intake_sessions"],
  },
  "20260901147000-coach-delivery-published": {
    seed: sessionWith("published = true"),
    tables: ["coach_intake_sessions"],
  },
  "20260901146000-coach-reminder-claims": {
    seed: "INSERT INTO coach_reminder_sends (coach_id, reminder_date, report_id, email, sent_at) VALUES ('roundtrip', '2026-01-01', 'roundtrip', 'reader@example.test', NULL)",
    tables: ["coach_reminder_sends"],
    rewrites: true,
  },
  "20260901145000-coach-report-edits": {
    seed: `${REPORT}; INSERT INTO coach_report_edits (report_id, changes) VALUES ('roundtrip', '{}')`,
    tables: ["coach_reports"],
  },
  "20260901144000-coach-reminder-summaries": {
    seed: "INSERT INTO coach_reminder_summaries (reminder_date) VALUES ('2026-01-01')",
    tables: ["coach_reminder_summaries"],
  },
  "20260901143000-coach-reminder-sends": {
    seed: "INSERT INTO coach_reminder_sends (coach_id, reminder_date, report_id, email) VALUES ('roundtrip', '2026-01-01', 'roundtrip', 'reader@example.test')",
    tables: ["coach_reminder_sends"],
  },
  "20260901142000-coach-leader-email-changes": {
    seed: "INSERT INTO coach_leader_email_changes (slug, previous_email, new_email) VALUES ('roundtrip', 'before@example.test', 'after@example.test')",
    tables: ["coach_leader_email_changes"],
  },
  "20260901141000-coach-intake-release-required": {
    seed: sessionWith("release_required = true"),
    tables: ["coach_intake_sessions"],
  },
  "20260901140000-coach-amendment-leader": {
    seed: `${REPORT}; ${AMENDMENT}, coach_id) VALUES ('roundtrip', 1, '{}', '{}', 'roundtrip')`,
    tables: ["coach_reports"],
  },
  "20260901139000-coach-revision-claim": {
    seed: `${REPORT}; ${AMENDMENT}, sending_at) VALUES ('roundtrip', 1, '{}', '{}', now())`,
    tables: ["coach_reports"],
  },
  "20260901138000-coach-report-amendments": {
    seed: `${REPORT}; ${AMENDMENT}) VALUES ('roundtrip', 1, '{}', '{}')`,
    tables: ["coach_reports"],
  },
  "20260901137000-coach-first-lesson": {
    seed: reportWith("first_lesson = true"),
    tables: ["coach_reports"],
  },
  "20260901136000-coach-delivery-skipped": {
    seed: sessionWith("skipped_recipients = '{reader@example.test}'"),
    tables: ["coach_intake_sessions"],
  },
  "20260901135000-coach-intake-admin-attribution": {
    seed: sessionWith("matched_by = 'admin', coach_id = 'roundtrip'"),
    tables: ["coach_intake_sessions"],
    rewrites: true,
  },
  "20260901134000-coach-delivery-recipients": {
    seed: sessionWith("delivered_to = '{reader@example.test}'"),
    tables: ["coach_intake_sessions"],
  },
  "20260901133000-coach-calibration-per-leader": {
    seed: `${RUN}, per_leader) VALUES ('roundtrip', 0, 1, 1, 1, '{}')`,
    tables: ["coach_calibration_runs"],
  },
  "20260901132000-coach-report-held": {
    seed: reportWith("held = true"),
    tables: ["coach_reports"],
  },
  "20260901131000-coach-intake-hold-reason": {
    seed: sessionWith("hold_reason = 'held for review'"),
    tables: ["coach_intake_sessions"],
  },
  "20260901130000-coach-calibration-runs": {
    seed: `${RUN}) VALUES ('roundtrip', 0, 1, 1, 1)`,
    tables: ["coach_calibration_runs"],
  },
  "20260901129000-coach-pipeline-states": {
    seed: sessionWith("state = 'delivering', coach_id = 'roundtrip'"),
    tables: ["coach_intake_sessions"],
    rewrites: true,
  },
  "20260901127000-coach-report-evidence": {
    seed: reportWith("evidence = '{}'"),
    tables: ["coach_reports"],
  },
  "20260901126000-coach-intake-sessions": {
    seed: SESSION,
    tables: ["coach_intake_sessions"],
  },
  "20260901125000-coach-session-archive": {
    seed: "INSERT INTO coach_session_assets (coach_id, source_session_id, kind, storage_key) VALUES ('roundtrip', 'roundtrip', 'transcript', 'roundtrip')",
    tables: ["coach_session_assets"],
  },
  "20260901124000-coach-score-provenance": {
    seed: `${REPORT}; INSERT INTO coach_report_dimension_scores (report_id, dimension_n, provenance) VALUES ('roundtrip', 1, 'machine')`,
    tables: ["coach_reports"],
  },
  "20260901122000-coach-monthly-leader-summaries": {
    seed: "INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary) VALUES ('roundtrip', '2026-01', '{}')",
    tables: ["coach_monthly_leader_summaries"],
  },
  "20260901121000-coach-monthly-narratives": {
    seed: "INSERT INTO coach_monthly_narratives (month) VALUES ('2026-01')",
    tables: ["coach_monthly_narratives"],
  },
  "20260901120000-coach-roster-in-database": {
    seed: "INSERT INTO coach_leaders (email, slug) VALUES ('leader@example.test', 'roundtrip')",
    tables: ["coach_leaders"],
  },
  "20260825120000-create-coach-reports-store": {
    seed: REPORT,
    tables: ["coach_reports"],
  },
};

async function clear(db: Kysely<unknown>, tables: string[]): Promise<void> {
  for (const table of tables)
    await sql`DO $$ BEGIN IF to_regclass(${sql.lit(table)}) IS NOT NULL THEN EXECUTE ${sql.lit(`DELETE FROM ${table}`)}; END IF; END $$`.execute(
      db,
    );
}

async function refusals(
  db: Kysely<unknown>,
  migrator: Migrator,
  block: string[],
): Promise<string[]> {
  const failures: string[] = [];
  const discard = process.env[DISCARD_FLAG];
  delete process.env[DISCARD_FLAG];
  try {
    for (const name of [...block].reverse()) {
      const refusal = REFUSALS[name];
      if (!refusal) continue;
      settled(`down to ${name}`, await migrator.migrateTo(name));
      for (const statement of refusal.seed.split("; "))
        await sql.raw(statement).execute(db);
      const refused = await migrator.migrateDown();
      const outcome = refused.results?.find((r) => r.migrationName === name);
      if (
        outcome?.status !== "Error" ||
        !String(refused.error).includes("rerun the down")
      ) {
        failures.push(`${name}: its down ran over a seeded row`);
        await clear(db, refusal.tables);
        continue;
      }
      if (refusal.rewrites) {
        await clear(db, refusal.tables);
        settled(`${name} down once clear`, await migrator.migrateDown());
      } else {
        process.env[DISCARD_FLAG] = "1";
        settled(
          `${name} down with ${DISCARD_FLAG}`,
          await migrator.migrateDown(),
        );
        delete process.env[DISCARD_FLAG];
        await clear(db, refusal.tables);
      }
      console.log(`${name}: refused a seeded row (${refused.error})`);
    }
  } finally {
    if (discard === undefined) delete process.env[DISCARD_FLAG];
    else process.env[DISCARD_FLAG] = discard;
  }
  return failures;
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

    if (before !== after) {
      console.error(
        `schema differs after the round trip, ${firstDifference(before, after)}`,
      );
      return false;
    }
    console.log("schema after up, down and up matches the first up");

    const failures = await refusals(db, migrator, block);
    for (const failure of failures) console.error(failure);
    settled("up after the refusals", await migrator.migrateToLatest());
    const last = await schemaDump(db);
    if (last !== before) {
      console.error(
        `schema differs after the refusal checks, ${firstDifference(before, last)}`,
      );
      return false;
    }
    return failures.length === 0;
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

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

import { DISCARD_FLAG } from "../../migrations/20261011010000-coach-reports-and-roster";
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
const USER = (email: string) =>
  `INSERT INTO "user" (email, "firstName", "lastName") VALUES ('${email}', 'R', 'T')`;

type Refusal = {
  seed: string;
  tables: string[];
  rewrites?: true;
};

const REPORTS_AND_ROSTER = "20261011010000-coach-reports-and-roster";
const SESSION_PIPELINE = "20261011020000-coach-session-pipeline";
const UPLOADS_ROTATING = "20261011030000-coach-uploads-rotating-schedules";
const IDENTITY_BINDING = "20261011040000-coach-identity-binding";

const REFUSALS: [string, Refusal][] = [
  [
    IDENTITY_BINDING,
    {
      seed: `${USER("roundtrip-admin@example.test")}; INSERT INTO coach_admins (email, user_id) SELECT email, id FROM "user" WHERE email = 'roundtrip-admin@example.test'`,
      tables: ["coach_admins"],
    },
  ],
  [
    IDENTITY_BINDING,
    {
      seed: "INSERT INTO coach_leader_email_changes (slug, previous_email, new_email) VALUES ('roundtrip', 'before@example.test', 'after@example.test')",
      tables: ["coach_leader_email_changes"],
    },
  ],
  [
    IDENTITY_BINDING,
    {
      seed: "INSERT INTO coach_leader_email_requests (slug, new_email, token_hash, expires_at) VALUES ('roundtrip', 'after@example.test', 'h', now())",
      tables: ["coach_leader_email_requests"],
    },
  ],
  [
    IDENTITY_BINDING,
    {
      seed: `${USER("roundtrip-cleared@example.test")}; INSERT INTO coach_confirmation_clears (user_id, email, source) SELECT id, email, 'sweep' FROM "user" WHERE email = 'roundtrip-cleared@example.test'`,
      tables: ["coach_confirmation_clears"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: `${SESSION}; UPDATE coach_intake_sessions SET source = 'upload', state = 'received'`,
      tables: ["coach_intake_sessions"],
      rewrites: true,
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: `${SESSION}; UPDATE coach_intake_sessions SET leader_cue = 'none'`,
      tables: ["coach_intake_sessions"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_leaders (email, rotating_only) VALUES ('leader@example.test', true)",
      tables: ["coach_leaders"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_uploads (coach_id, class_key, class_name, session_date, file_name, file_bytes, content_type, parts, attempts) VALUES ('roundtrip', 'group:roundtrip', 'Roundtrip', '2026-01-05', 'a.mp4', 1, 'video/mp4', 1, 1)",
      tables: ["coach_uploads"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_rotating_classes (name, group_email) VALUES ('roundtrip', 'group@example.test')",
      tables: ["coach_rotating_classes"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_reminder_sends (coach_id, reminder_date, report_id, email, sent_at) VALUES ('roundtrip', '2026-01-01', 'roundtrip', 'reader@example.test', NULL)",
      tables: ["coach_reminder_sends"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_reminder_summaries (reminder_date) VALUES ('2026-01-01')",
      tables: ["coach_reminder_summaries"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_monthly_reports (kind, month, summary, state, sending_at) VALUES ('program', '2026-01', '{}', 'sending', now())",
      tables: ["coach_monthly_reports"],
    },
  ],
  [
    UPLOADS_ROTATING,
    {
      seed: "INSERT INTO coach_monday_reminders (run_date, kind, coach_id, found, outcome) VALUES ('2026-01-05', 'leader', 'roundtrip', false, 'sent')",
      tables: ["coach_monday_reminders"],
    },
  ],
  [
    SESSION_PIPELINE,
    {
      seed: SESSION,
      tables: ["coach_intake_sessions"],
    },
  ],
  [
    SESSION_PIPELINE,
    {
      seed: "INSERT INTO coach_session_assets (coach_id, source_session_id, kind, storage_key) VALUES ('roundtrip', 'roundtrip', 'transcript', 'roundtrip')",
      tables: ["coach_session_assets"],
    },
  ],
  [
    SESSION_PIPELINE,
    {
      seed: "INSERT INTO coach_calibration_runs (model_version, composite_mae, dimensions_within_one, comparisons, reports) VALUES ('roundtrip', 0, 1, 1, 1)",
      tables: ["coach_calibration_runs"],
    },
  ],
  [
    SESSION_PIPELINE,
    {
      seed: `${REPORT}; INSERT INTO coach_report_amendments (report_id, revision, coach_id, previous, changes) VALUES ('roundtrip', 1, 'roundtrip', '{}', '{}')`,
      tables: ["coach_reports"],
    },
  ],
  [
    SESSION_PIPELINE,
    {
      seed: `${REPORT}; INSERT INTO coach_report_edits (report_id, changes) VALUES ('roundtrip', '{}')`,
      tables: ["coach_reports"],
    },
  ],
  [
    REPORTS_AND_ROSTER,
    {
      seed: REPORT,
      tables: ["coach_reports"],
    },
  ],
  [
    REPORTS_AND_ROSTER,
    {
      seed: "INSERT INTO coach_monthly_narratives (month) VALUES ('2026-01')",
      tables: ["coach_monthly_narratives"],
    },
  ],
  [
    REPORTS_AND_ROSTER,
    {
      seed: "INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary) VALUES ('roundtrip', '2026-01', '{}')",
      tables: ["coach_monthly_leader_summaries"],
    },
  ],
  [
    REPORTS_AND_ROSTER,
    {
      seed: "INSERT INTO coach_leaders (email, slug) VALUES ('leader@example.test', 'roundtrip')",
      tables: ["coach_leaders"],
    },
  ],
];

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
    for (const [name, refusal] of REFUSALS) {
      if (!block.includes(name)) {
        failures.push(`${name}: not in the coach block`);
        continue;
      }
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

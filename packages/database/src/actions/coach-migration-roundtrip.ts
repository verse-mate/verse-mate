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
import { RESTORE_FLAG } from "../../migrations/20261011050000-coach-clear-unproven-confirmations";
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
const LEADER = `INSERT INTO coach_leaders (email) VALUES ('leader@example.test')`;
const USER = (email: string) =>
  `INSERT INTO "user" (email, "firstName", "lastName") VALUES ('${email}', 'R', 'T')`;
const session = (set: string) =>
  `${SESSION}; UPDATE coach_intake_sessions SET ${set}`;
const leader = (set: string) => `${LEADER}; UPDATE coach_leaders SET ${set}`;
const row = (table: string, seed: string): Refusal => ({
  seed,
  tables: [table],
  names: table,
});

type Refusal = {
  seed: string;
  tables: string[];
  names: string;
  hard?: true;
};

const REFUSALS: [string, Refusal][] = [
  [
    "coach-clear-unproven-confirmations",
    row(
      "coach_confirmation_clears",
      `${USER("roundtrip-swept@example.test")}; INSERT INTO coach_confirmation_clears (user_id, email, password_fingerprint, source) SELECT id, email, md5(''), 'sweep' FROM "user" WHERE email = 'roundtrip-swept@example.test'`,
    ),
  ],
  [
    "coach-identity-binding",
    row(
      "coach_admins",
      `${USER("roundtrip-admin@example.test")}; INSERT INTO coach_admins (email, user_id) SELECT email, id FROM "user" WHERE email = 'roundtrip-admin@example.test'`,
    ),
  ],
  [
    "coach-identity-binding",
    row(
      "coach_leaders",
      `${USER("roundtrip-leader@example.test")}; INSERT INTO coach_leaders (email, user_id) SELECT email, id FROM "user" WHERE email = 'roundtrip-leader@example.test'`,
    ),
  ],
  [
    "coach-identity-binding",
    row(
      "coach_leader_email_changes",
      "INSERT INTO coach_leader_email_changes (slug, previous_email, new_email) VALUES ('roundtrip', 'before@example.test', 'after@example.test')",
    ),
  ],
  [
    "coach-identity-binding",
    row(
      "coach_leader_email_requests",
      "INSERT INTO coach_leader_email_requests (slug, new_email, token_hash, expires_at) VALUES ('roundtrip', 'after@example.test', 'h', now())",
    ),
  ],
  [
    "coach-identity-binding",
    row(
      "coach_confirmation_clears",
      `${USER("roundtrip-cleared@example.test")}; INSERT INTO coach_confirmation_clears (user_id, email, password_fingerprint, source) SELECT id, email, md5(''), 'sweep' FROM "user" WHERE email = 'roundtrip-cleared@example.test'`,
    ),
  ],
  ...[
    "state = 'received'",
    "state = 'upload_failed'",
    "state = 'duplicate'",
    "matched_by = 'rotating_class'",
    "matched_by = 'upload'",
  ].map((set): [string, Refusal] => [
    "coach-uploads-rotating-schedules",
    {
      seed: session(set),
      tables: ["coach_intake_sessions"],
      names: "the older code cannot hold",
      hard: true,
    },
  ]),
  ...[
    "source = 'upload'",
    "class_key = 'group:roundtrip'",
    "meeting_link = 'https://example.test/meet'",
    "leader_cue = 'none'",
    "leader_cue_line = 'Ruth, would you read?'",
    "duplicate_of = 'roundtrip-other'",
    "duplicate_dismissed_at = now()",
  ].map((set): [string, Refusal] => [
    "coach-uploads-rotating-schedules",
    row("coach_intake_sessions", session(set)),
  ]),
  [
    "coach-uploads-rotating-schedules",
    row("coach_leaders", leader("rotating_only = true")),
  ],
  ...[
    [
      "coach_uploads",
      "INSERT INTO coach_uploads (coach_id, class_key, class_name, session_date, file_name, file_bytes, content_type, parts, attempts) VALUES ('roundtrip', 'group:roundtrip', 'Roundtrip', '2026-01-05', 'a.mp4', 1, 'video/mp4', 1, 1)",
    ],
    [
      "coach_rotating_classes",
      "INSERT INTO coach_rotating_classes (name, group_email) VALUES ('roundtrip', 'group@example.test')",
    ],
    [
      "coach_reminder_sends",
      "INSERT INTO coach_reminder_sends (coach_id, reminder_date, report_id, email, sent_at) VALUES ('roundtrip', '2026-01-01', 'roundtrip', 'reader@example.test', NULL)",
    ],
    [
      "coach_reminder_summaries",
      "INSERT INTO coach_reminder_summaries (reminder_date) VALUES ('2026-01-01')",
    ],
    [
      "coach_monthly_reports",
      "INSERT INTO coach_monthly_reports (kind, month, summary, state, sending_at) VALUES ('program', '2026-01', '{}', 'sending', now())",
    ],
    [
      "coach_monday_reminders",
      "INSERT INTO coach_monday_reminders (run_date, kind, coach_id, found, outcome) VALUES ('2026-01-05', 'leader', 'roundtrip', false, 'sent')",
    ],
  ].map(([table, seed]): [string, Refusal] => [
    "coach-uploads-rotating-schedules",
    row(table, seed),
  ]),
  ...[
    ["coach_intake_sessions", SESSION],
    [
      "coach_session_assets",
      "INSERT INTO coach_session_assets (coach_id, source_session_id, kind, storage_key) VALUES ('roundtrip', 'roundtrip', 'transcript', 'roundtrip')",
    ],
    [
      "coach_calibration_runs",
      "INSERT INTO coach_calibration_runs (model_version, composite_mae, dimensions_within_one, comparisons, reports) VALUES ('roundtrip', 0, 1, 1, 1)",
    ],
  ].map(([table, seed]): [string, Refusal] => [
    "coach-session-pipeline",
    row(table, seed),
  ]),
  [
    "coach-session-pipeline",
    {
      seed: `${REPORT}; INSERT INTO coach_report_amendments (report_id, revision, coach_id, previous, changes) VALUES ('roundtrip', 1, 'roundtrip', '{}', '{}')`,
      tables: ["coach_reports"],
      names: "coach_report_amendments",
    },
  ],
  [
    "coach-session-pipeline",
    {
      seed: `${REPORT}; INSERT INTO coach_report_edits (report_id, changes) VALUES ('roundtrip', '{}')`,
      tables: ["coach_reports"],
      names: "coach_report_edits",
    },
  ],
  ["coach-reports-and-roster", row("coach_reports", REPORT)],
  [
    "coach-reports-and-roster",
    row(
      "coach_monthly_narratives",
      "INSERT INTO coach_monthly_narratives (month) VALUES ('2026-01')",
    ),
  ],
  [
    "coach-reports-and-roster",
    row(
      "coach_monthly_leader_summaries",
      "INSERT INTO coach_monthly_leader_summaries (coach_id, month, summary) VALUES ('roundtrip', '2026-01', '{}')",
    ),
  ],
  ...[
    "slug = 'roundtrip'",
    "is_coach = false",
    "zoom_link = 'https://example.test/zoom'",
    "is_benchmark = true",
    "title_match = '{roundtrip}'",
    "alt_emails = '{alt@example.test}'",
    "not_teaching_attested_at = now()",
    `not_teaching_attested_by = (SELECT id FROM "user" ORDER BY "createdAt" LIMIT 1)`,
  ].map((set): [string, Refusal] => [
    "coach-reports-and-roster",
    row("coach_leaders", leader(set)),
  ]),
];

function refusedBy(
  name: string,
  outcome: MigrationResultSet,
  names: string,
): boolean {
  const result = outcome.results?.find((r) => r.migrationName === name);
  const message = String(outcome.error);
  return (
    result?.status === "Error" &&
    message.includes("rerun the down") &&
    message.includes(names)
  );
}

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
  const restore = process.env[RESTORE_FLAG];
  delete process.env[DISCARD_FLAG];
  delete process.env[RESTORE_FLAG];
  try {
    for (const [suffix, refusal] of REFUSALS) {
      const name = block.find((n) => n.endsWith(`-${suffix}`));
      if (!name) {
        failures.push(`${suffix}: no such migration in the coach block`);
        continue;
      }
      settled(`down to ${name}`, await migrator.migrateTo(name));
      for (const statement of refusal.seed.split("; "))
        await sql.raw(statement).execute(db);
      const refused = await migrator.migrateDown();
      if (!refusedBy(name, refused, refusal.names)) {
        failures.push(
          `${name}: its down did not refuse a seeded row naming ${refusal.names} (${refused.error ?? "no error"})`,
        );
        await clear(db, refusal.tables);
        continue;
      }
      process.env[DISCARD_FLAG] = "1";
      const flagged = await migrator.migrateDown();
      delete process.env[DISCARD_FLAG];
      if (refusal.hard) {
        if (!refusedBy(name, flagged, refusal.names))
          failures.push(
            `${name}: ${DISCARD_FLAG} let its down past a row it must refuse`,
          );
        await clear(db, refusal.tables);
        settled(`${name} down once clear`, await migrator.migrateDown());
      } else {
        settled(`${name} down with ${DISCARD_FLAG}`, flagged);
        await clear(db, refusal.tables);
      }
      console.log(`${name}: refused a seeded row (${refused.error})`);
    }
  } finally {
    if (discard === undefined) delete process.env[DISCARD_FLAG];
    else process.env[DISCARD_FLAG] = discard;
    if (restore !== undefined) process.env[RESTORE_FLAG] = restore;
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
  if (
    !LOCAL_HOSTS.has(configured.hostname) ||
    configured.searchParams.has("host") ||
    configured.searchParams.has("hostaddr")
  )
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

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import type Schema from "database/src/models/Database";
import {
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
  sql,
} from "kysely";

import {
  SESSION_STATES,
  claimable,
  correctable,
  redeliverable,
  releasable,
  requeuable,
  rescorable,
  scorable,
  shownToAnyone,
  stuck,
  unsentAfterPublish,
} from "./coach-session-state";

const conn = Database.getOrCreateConnection();
const PREFIX = "ff-st-";
const LEADER = "session-state-leader";

type Seed = {
  n: number;
  state: string;
  coach?: string | null;
  release?: boolean;
  parallel?: boolean;
  stale?: boolean;
  report?: boolean;
  hold?: string;
};

const SEEDS: Seed[] = [
  { n: 1, state: "observed", coach: null },
  { n: 2, state: "retained" },
  { n: 3, state: "scored", report: true },
  { n: 4, state: "scored", report: true, hold: "held for review: x" },
  { n: 5, state: "scored", report: true, release: true },
  { n: 6, state: "delivery_pending", report: true },
  { n: 7, state: "delivery_pending", report: true, release: true },
  { n: 8, state: "delivering", report: true, coach: "session-state-a" },
  {
    n: 9,
    state: "delivering",
    report: true,
    coach: "session-state-b",
    stale: true,
  },
  { n: 10, state: "delivery_failed", report: true },
  { n: 11, state: "delivery_failed", report: true, parallel: true },
  { n: 12, state: "scoring_failed", report: true },
  { n: 13, state: "delivered", report: true },
  { n: 14, state: "delivery_pending", report: true, parallel: true },
];

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", `${PREFIX}%`)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("id", "like", `${PREFIX}%`)
    .execute();
}

beforeAll(async () => {
  await clear();
  for (const s of SEEDS) {
    const id = `${PREFIX}${s.n}`;
    if (s.report)
      await conn
        .insertInto("coach_reports")
        .values({
          id,
          coach_id: LEADER,
          session_date: "2026-08-22",
          source_session_id: id,
          legacy_ids: [],
          summary: {},
          metrics: {},
          body: {},
        })
        .execute();
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: id,
        coach_id: s.coach === undefined ? LEADER : s.coach,
        title: "t",
        session_date: "2026-08-22",
        state: s.state,
        report_id: s.report ? id : null,
        release_required: s.release ?? false,
        parallel_run: s.parallel ?? false,
        hold_reason: s.hold ?? null,
        updated_at: s.stale ? sql`NOW() - interval '1 hour'` : sql`NOW()`,
      })
      .execute();
  }
});
afterAll(clear);

type Predicate = (
  eb: ExpressionBuilder<Schema, "coach_intake_sessions">,
) => Expression<SqlBool>;

async function selected(predicate: Predicate): Promise<number[]> {
  const rows = await conn
    .selectFrom("coach_intake_sessions")
    .select("source_session_id")
    .where("source_session_id", "like", `${PREFIX}%`)
    .where(predicate)
    .execute();
  return rows
    .map((r) => Number(r.source_session_id.slice(PREFIX.length)))
    .sort((a, b) => a - b);
}

describe("the session state machine", () => {
  it("the state union is exactly what the database allows", async () => {
    const { rows } = await sql<{ d: string }>`
      SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
      WHERE conname = 'coach_intake_sessions_state_check'
    `.execute(conn);
    const allowed = [...rows[0].d.matchAll(/'([a-z_]+)'::text/g)].map(
      (m) => m[1],
    );
    expect([...SESSION_STATES].sort() as string[]).toEqual(allowed.sort());
  });

  it.each([
    ["scorable", scorable, [2]],
    ["claimable", claimable, [3, 4, 6, 9]],
    ["redeliverable", redeliverable, [6, 7, 9]],
    ["unsentAfterPublish", unsentAfterPublish, [3, 5, 8, 9]],
    ["releasable", releasable, [3, 4, 5, 7]],
    ["requeuable", requeuable, [10, 12]],
    ["stuck", stuck, [1, 4, 5, 6, 7, 10, 11, 12, 14]],
  ] as Array<[string, Predicate, number[]]>)(
    "%s selects exactly its sessions",
    async (_name, predicate, expected) => {
      expect(await selected(predicate)).toEqual(expected);
    },
  );

  it("a correction is possible only before anything was sent", () => {
    expect(SESSION_STATES.filter(correctable)).toEqual([
      "scored",
      "delivery_pending",
      "delivery_failed",
    ]);
  });

  it("a re-attribution re-scores every state that has a score", () => {
    expect(SESSION_STATES.filter(rescorable)).toEqual([
      "scored",
      "delivered",
      "scoring_failed",
      "delivery_pending",
      "delivery_failed",
    ]);
  });

  it("a report is shown once it is published, confirmed or attempted to anyone", () => {
    const none = { published: false, deliveredTo: [], attemptedTo: [] };
    expect(shownToAnyone(none)).toBe(false);
    expect(shownToAnyone({ ...none, published: true })).toBe(true);
    expect(shownToAnyone({ ...none, deliveredTo: ["a@x.test"] })).toBe(true);
    expect(shownToAnyone({ ...none, attemptedTo: ["a@x.test"] })).toBe(true);
  });
});

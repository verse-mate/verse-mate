import { afterAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import { up } from "../../../database/migrations/20260901154000-coach-no-calibration-hold";
import { claimable, redeliverable, releasable } from "./coach-session-state";

const conn = Database.getOrCreateConnection();
const SESSION = "ff-migration-calibration-held";

class RolledBack extends Error {}

afterAll(async () => {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "=", SESSION)
    .execute();
  await conn.deleteFrom("coach_reports").where("id", "=", SESSION).execute();
});

describe("removing the calibration gate keeps the reports it held from their leaders", () => {
  it("a calibration-held report becomes a scoring-version hold: still held, not deliverable, releasable by an admin, its reason naming the removed gate", async () => {
    const seen = await conn
      .transaction()
      .execute(async (trx) => {
        await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_hold_kind_check`.execute(
          trx,
        );
        await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_hold_kind_check CHECK (hold_kind IS NULL OR hold_kind IN ('review', 'reattributed', 'calibration', 'governance', 'cold-recall', 'no-mailer', 'send-failed', 'scoring-version'))`.execute(
          trx,
        );
        await trx
          .insertInto("coach_reports")
          .values({
            id: SESSION,
            coach_id: "migration-leader",
            session_date: "2026-09-20",
            source_session_id: SESSION,
            legacy_ids: [],
            summary: {},
            metrics: {},
            body: {},
            held: true,
          })
          .execute();
        await trx
          .insertInto("coach_intake_sessions")
          .values({
            source_session_id: SESSION,
            coach_id: "migration-leader",
            matched_by: "title_match",
            title: "t",
            session_date: "2026-09-20",
            state: "delivery_pending",
            report_id: SESSION,
            hold_kind: "calibration" as never,
            hold_reason:
              "held for calibration: no calibration run is on record for this model version",
          })
          .execute();

        await up(trx as never);

        const row = await trx
          .selectFrom("coach_intake_sessions")
          .select(["state", "hold_kind", "hold_reason"])
          .where("source_session_id", "=", SESSION)
          .executeTakeFirstOrThrow();
        const matches = async (predicate: typeof claimable) =>
          (await trx
            .selectFrom("coach_intake_sessions")
            .select("source_session_id")
            .where("source_session_id", "=", SESSION)
            .where(predicate)
            .executeTakeFirst()) !== undefined;
        const report = await trx
          .selectFrom("coach_reports")
          .select("held")
          .where("id", "=", SESSION)
          .executeTakeFirstOrThrow();
        const seen = {
          row,
          held: report.held,
          claimable: await matches(claimable),
          redeliverable: await matches(redeliverable),
          releasable: await matches(releasable),
        };
        throw Object.assign(new RolledBack(), { seen });
      })
      .catch((error: unknown) => {
        if (error instanceof RolledBack)
          return (error as RolledBack & { seen: unknown }).seen;
        throw error;
      });

    expect(seen).toMatchObject({
      row: { state: "scored", hold_kind: "scoring-version" },
      held: true,
      claimable: false,
      redeliverable: false,
      releasable: true,
    });
    expect(
      (seen as { row: { hold_reason: string } }).row.hold_reason,
    ).toContain("calibration gate");
  });
});

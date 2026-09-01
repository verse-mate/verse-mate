import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import leaderMapJson from "./coach-leader-map.json";
import { backfillCoachRoster } from "./coach-roster.backfill";
import coachDataJson from "./coach.data.json";

const conn = Database.getOrCreateConnection();

type Bundle = {
  coaches: Array<{ id: string; email: string; name: string }>;
  admins?: string[];
  monthlyNarratives?: Record<string, unknown>;
  monthlyLeaderSummaries?: Record<string, Record<string, unknown>>;
};
const bundle = coachDataJson as unknown as Bundle;

// EVERY figure derived from the bundle this run reads. The host republishes
// hourly while the port is in flight, and the leader count moved 16 -> 17
// mid-review; a literal is stale on arrival.
const EXPECTED_LEADERS = bundle.coaches.length;
const EXPECTED_NARRATIVE_MONTHS = Object.keys(
  bundle.monthlyNarratives ?? {},
).length;
const EXPECTED_LEADER_SUMMARIES = Object.values(
  bundle.monthlyLeaderSummaries ?? {},
).reduce((n, byMonth) => n + Object.keys(byMonth).length, 0);
const BUNDLE_EMAILS = bundle.coaches.map((c) => c.email);
const BUNDLE_SLUGS = bundle.coaches.map((c) => c.id);

async function clear() {
  await conn
    .deleteFrom("coach_leaders")
    .where("email", "in", BUNDLE_EMAILS)
    .execute();
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "in", BUNDLE_SLUGS)
    .execute();
  await conn
    .deleteFrom("coach_monthly_narratives")
    .where(
      "month",
      "in",
      Object.keys(bundle.monthlyNarratives ?? { __none: 1 }),
    )
    .execute();
}

describe("roster and monthly backfill (DB)", () => {
  beforeAll(clear);
  afterAll(clear);

  it("loads every leader on the deployed roster, counted from the bundle it read", async () => {
    const result = await backfillCoachRoster();
    expect(result.leaders).toBe(EXPECTED_LEADERS);

    const rows = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "email", "name"])
      .where("email", "in", BUNDLE_EMAILS)
      .execute();
    expect(rows.length).toBe(EXPECTED_LEADERS);
    // the slug is what coach_reports joins on — a null one is a broken roster
    expect(rows.every((r) => Boolean(r.slug))).toBe(true);
    expect(new Set(rows.map((r) => r.slug))).toEqual(new Set(BUNDLE_SLUGS));
  });

  it("marks exactly one benchmark leader", async () => {
    const rows = await conn
      .selectFrom("coach_leaders")
      .select("slug")
      .where("is_benchmark", "=", true)
      .execute();
    expect(rows.length).toBe(1);
    expect(rows[0].slug).toBe("bryan-bailey");
  });

  it("carries the intake attribution keywords across from the leader map", async () => {
    const mapped = (
      leaderMapJson as {
        coaches: Array<{ email: string; title_match?: string[] }>;
      }
    ).coaches.find((c) => (c.title_match ?? []).length > 0 && c.email);
    expect(mapped).toBeTruthy();
    const row = await conn
      .selectFrom("coach_leaders")
      .select("title_match")
      .where("email", "=", (mapped as { email: string }).email)
      .executeTakeFirst();
    expect(row?.title_match).toEqual(
      (mapped as { title_match: string[] }).title_match,
    );
  });

  it("loads every monthly narrative and every leader-month summary, counted from the bundle", async () => {
    const narratives = await conn
      .selectFrom("coach_monthly_narratives")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(narratives.n)).toBe(EXPECTED_NARRATIVE_MONTHS);

    const summaries = await conn
      .selectFrom("coach_monthly_leader_summaries")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("coach_id", "in", BUNDLE_SLUGS)
      .executeTakeFirstOrThrow();
    expect(Number(summaries.n)).toBe(EXPECTED_LEADER_SUMMARIES);
  });

  it("is idempotent, and a re-run does NOT overwrite an admin's edited keywords", async () => {
    const target = bundle.coaches[0];
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["admin edited this"] })
      .where("email", "=", target.email)
      .execute();

    const again = await backfillCoachRoster();
    expect(again.leaders).toBe(EXPECTED_LEADERS);

    const rows = await conn
      .selectFrom("coach_leaders")
      .select(["title_match"])
      .where("email", "=", target.email)
      .execute();
    expect(rows.length).toBe(1);
    // The database is authoritative after the seed (open question 6).
    expect(rows[0].title_match).toEqual(["admin edited this"]);
  });
});

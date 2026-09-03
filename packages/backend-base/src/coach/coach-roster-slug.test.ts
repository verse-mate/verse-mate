import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const EMAIL = "slug-leader@example.test";
const SLUG = "slug-leader";

const service = new CoachService(Database);

async function clear() {
  await conn.deleteFrom("coach_reports").where("coach_id", "=", SLUG).execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
  await conn.deleteFrom("user").where("email", "=", EMAIL).execute();
}

/**
 * The gap a real browser drive found, and the reason task 7.1 is dangerous
 * without it.
 *
 * A roster record's id has to be the SLUG. Every overlay keys on it —
 * coach_reports.coach_id, coach_notes.coach_id, coach_recording_links.coach_id
 *, so a record carrying coach_leaders' uuid joins to nothing.
 *
 * It looked harmless while the compiled-in bundle supplied slug-keyed records
 * for every real leader and only admin-added placeholders (who have no reports)
 * came through the database path. After 7.1 deletes the bundle, EVERY leader
 * resolves through that path, so the uuid would empty every leader's history
 * at once, silently, on the deploy that removed the file.
 */
describe("a roster leader resolves to their reports", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: SLUG, email: EMAIL, name: "Slug Leader" })
      .execute();
    await conn
      .insertInto("coach_reports")
      .values({
        id: "slug-report-1",
        coach_id: SLUG,
        session_date: "2026-08-22",
        source_session_id: "ff-slug-1",
        legacy_ids: [],
        summary: { session: "Obadiah", score: 70 },
        metrics: {},
        body: {},
      })
      .execute();
  });
  afterEach(clear);

  it("getMe returns the SLUG as the profile id, not the roster row's uuid", async () => {
    const user = await conn
      .insertInto("user")
      .values({ email: EMAIL, firstName: "Slug", lastName: "Leader" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const me = await service.getMe(user.id);
    expect(me?.isCoach).toBe(true);
    expect(me?.profile?.id).toBe(SLUG);
    // A uuid here is the bug: it is what the summary list would be queried by.
    expect(me?.profile?.id).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("the id getMe returns actually finds that leader's reports", async () => {
    const user = await conn
      .insertInto("user")
      .values({ email: EMAIL, firstName: "Slug", lastName: "Leader" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const me = await service.getMe(user.id);
    const page = await service.getReportSummaries(me?.profile?.id as string);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("slug-report-1");
  });

  it("a roster row with no slug yet still resolves, by its uuid", async () => {
    // 3.10's backfill fills the slug; a row added before it must not 500.
    await conn
      .updateTable("coach_leaders")
      .set({ slug: null })
      .where("email", "=", EMAIL)
      .execute();
    const user = await conn
      .insertInto("user")
      .values({ email: EMAIL, firstName: "Slug", lastName: "Leader" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const me = await service.getMe(user.id);
    expect(me?.isCoach).toBe(true);
    expect(me?.profile?.id).toBeTruthy();
  });
});

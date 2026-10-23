import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { attributeSession, loadAttributionRoster } from "./coach-attribution";
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
      .values({
        email: EMAIL,
        firstName: "Slug",
        lastName: "Leader",
        emailVerified: true,
      })
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
      .values({
        email: EMAIL,
        firstName: "Slug",
        lastName: "Leader",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const me = await service.getMe(user.id);
    const page = await service.getReportSummaries(me?.profile?.id as string);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("slug-report-1");
  });

  it("a roster row with no slug yet still resolves, by its uuid", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ slug: null })
      .where("email", "=", EMAIL)
      .execute();
    const user = await conn
      .insertInto("user")
      .values({
        email: EMAIL,
        firstName: "Slug",
        lastName: "Leader",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const me = await service.getMe(user.id);
    expect(me?.isCoach).toBe(true);
    expect(me?.profile?.id).toBeTruthy();
  });
});

describe("a leader added through the admin route can be attributed a session", () => {
  const ADDED = "added-slug@example.test";
  const SECOND = "added-slug-2@example.test";
  const INVITER = "added-slug-inviter@example.test";
  const KEYWORD_HOLDER = "added-slug-keyword@example.test";
  let inviter = "";

  async function clearAdded() {
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "in", [ADDED, SECOND, KEYWORD_HOLDER])
      .execute();
    await conn.deleteFrom("user").where("email", "=", INVITER).execute();
  }
  beforeEach(async () => {
    await clearAdded();
    inviter = (
      await conn
        .insertInto("user")
        .values({ email: INVITER, firstName: "I", lastName: "N" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  });
  afterEach(clearAdded);

  it("the added leader gets a slug derived the way the roster's slugs are", async () => {
    const added = await service.addLeader(inviter, {
      email: ADDED,
      name: "Pat O'Neil & Sam",
    });
    expect(added.ok).toBe(true);
    const row = await conn
      .selectFrom("coach_leaders")
      .select("slug")
      .where("email", "=", ADDED)
      .executeTakeFirstOrThrow();
    expect(row.slug).toBe("pat-o-neil-sam");
    expect(added.ok && added.coach.id).toBe("pat-o-neil-sam");
  });

  it("the attribution roster reaches the added leader", async () => {
    await service.addLeader(inviter, { email: ADDED, name: "Quill Added" });
    const roster = await loadAttributionRoster(Database);
    const match = attributeSession(
      { title: "Study with Quill Added", host_email: "", organizer_email: "" },
      roster,
    );
    expect(match).toEqual({ coachId: "quill-added", matchedBy: "name" });
  });

  it.each(["Grace", "Grace Kim"])(
    "a name %p carrying another leader's keyword is refused, naming the keyword and the leader, and nothing is stored",
    async (name) => {
      await conn
        .insertInto("coach_leaders")
        .values({
          slug: "added-slug-keyword",
          email: KEYWORD_HOLDER,
          name: "Keyword Holder",
          title_match: ["grace"],
        })
        .execute();
      const result = await service.addLeader(inviter, { email: ADDED, name });
      expect(result).toEqual({
        ok: false,
        reason: "keyword-conflict",
        conflicts: [{ keyword: "grace", leader: "added-slug-keyword" }],
      });
      expect(
        await conn
          .selectFrom("coach_leaders")
          .select("slug")
          .where("email", "=", ADDED)
          .executeTakeFirst(),
      ).toBeUndefined();
    },
  );

  it("a name whose slug an added leader already holds is refused", async () => {
    await service.addLeader(inviter, { email: ADDED, name: "Twin Name" });
    const result = await service.addLeader(inviter, {
      email: SECOND,
      name: "twin  name",
    });
    expect(result).toEqual({
      ok: false,
      reason: "slug-taken",
      slug: "twin-name",
    });
  });
});

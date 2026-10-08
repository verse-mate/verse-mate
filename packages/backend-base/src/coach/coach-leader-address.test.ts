import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const SLUG = "addr-leader";
const PLACEHOLDER = "addr-leader@needs-real-email.invalid";
const REAL = "addr-leader.real@example.test";
const OTHER = "addr-other@example.test";
const WYATT = "wyatt-wellington";
const WYATT_REAL = "wyatt.real@example.test";
const MILO = "milo-kerr";
const MILO_OLD = "milo.kerr@example.org";
const MILO_NEW = "milo.new@example.test";

const service = new CoachService(Database);

async function clear() {
  await conn.deleteFrom("coach_reports").where("coach_id", "=", SLUG).execute();
  await conn
    .deleteFrom("coach_leaders")
    .where((eb) =>
      eb.or([
        eb("slug", "in", [SLUG, WYATT, MILO]),
        eb("email", "in", [OTHER, REAL, WYATT_REAL, MILO_NEW]),
      ]),
    )
    .execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [REAL, WYATT_REAL, MILO_OLD])
    .execute();
}

async function account(email: string) {
  return (
    await conn
      .insertInto("user")
      .values({ email, firstName: "A", lastName: "L", emailVerified: true })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

beforeEach(async () => {
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: SLUG, email: PLACEHOLDER, name: "Addr Leader" },
      { slug: "addr-other", email: OTHER, name: "Addr Other" },
    ])
    .execute();
  await conn
    .insertInto("coach_reports")
    .values({
      id: "addr-report-1",
      coach_id: SLUG,
      session_date: "2026-09-20",
      source_session_id: "ff-addr-1",
      legacy_ids: [],
      summary: { session: "Habakkuk", score: 72 },
      metrics: {},
      body: {},
    })
    .execute();
});
afterEach(clear);

describe("A leader signs up after their reports exist", () => {
  it("once an admin sets the address they signed up with, they see their existing reports", async () => {
    const userId = await account(REAL);
    expect(await service.getMe(userId)).toBeNull();

    expect(
      await service.updateLeaderEmail(SLUG, " Addr-Leader.Real@Example.TEST "),
    ).toEqual({
      ok: true,
      email: REAL,
    });

    const me = await service.getMe(userId);
    expect(me?.profile).toMatchObject({ id: SLUG, email: REAL });
    const page = await service.getReportSummaries(me?.profile?.id as string);
    expect(page.items.map((r) => r.id)).toEqual(["addr-report-1"]);
  });

  it("a bundled leader's corrected address resolves to their roster record, once", async () => {
    const bundled = await conn
      .insertInto("coach_leaders")
      .values({
        slug: WYATT,
        email: "wyatt-wellington@needs-real-email.invalid",
        name: "Wyatt Wellington",
      })
      .returning("slug")
      .executeTakeFirstOrThrow();
    expect(bundled.slug).toBe(WYATT);
    const userId = await account(WYATT_REAL);

    expect(await service.updateLeaderEmail(WYATT, WYATT_REAL)).toEqual({
      ok: true,
      email: WYATT_REAL,
    });

    const me = await service.getMe(userId);
    expect(me?.profile).toMatchObject({ id: WYATT, email: WYATT_REAL });
    const roster = (await service.listCoaches()).filter((c) => c.id === WYATT);
    expect(roster).toHaveLength(1);
  });

  it("a bundled leader's previous address stops resolving once it is changed", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: MILO, email: MILO_OLD, name: "Milo Kerr" })
      .execute();
    const oldAccount = await account(MILO_OLD);
    expect((await service.getMe(oldAccount))?.profile?.id).toBe(MILO);

    await service.updateLeaderEmail(MILO, MILO_NEW);

    expect(await service.getMe(oldAccount)).toBeNull();
  });

  it("an address another leader holds is refused, and nothing changes", async () => {
    expect(await service.updateLeaderEmail(SLUG, OTHER)).toEqual({
      ok: false,
      refusal: "taken",
    });
    const row = await conn
      .selectFrom("coach_leaders")
      .select("email")
      .where("slug", "=", SLUG)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe(PLACEHOLDER);
  });

  it("an unknown leader is refused", async () => {
    expect(await service.updateLeaderEmail("addr-nobody", REAL)).toEqual({
      ok: false,
      refusal: "unknown-leader",
    });
  });
});

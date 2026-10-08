import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { COACH_PIPELINE_LIVE } from "./coach-cutover";
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
      noticeSent: false,
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
      noticeSent: false,
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

describe("a leader's address change is audited and announced to the old address", () => {
  const OLD = "addr-old@example.test";
  const NEW = "addr-new@example.test";
  const BENCH = "addr-bench";
  const BENCH_OLD = "addr-bench@example.test";
  let sent: Array<{ to: string; subject: string; text: string }> = [];
  const mailer = {
    sendEmail: async (data: {
      to: { email: string };
      subject: string;
      text: string;
    }) => {
      sent.push({ to: data.to.email, subject: data.subject, text: data.text });
      return { delivered: true };
    },
  };
  const live = new CoachService(Database, mailer);

  async function changes(slug: string) {
    return conn
      .selectFrom("coach_leader_email_changes")
      .select(["previous_email", "new_email", "changed_by"])
      .where("slug", "=", slug)
      .orderBy("changed_at")
      .execute();
  }

  beforeEach(async () => {
    sent = [];
    process.env[COACH_PIPELINE_LIVE] = "true";
    await conn
      .deleteFrom("coach_leader_email_changes")
      .where("slug", "in", [SLUG, BENCH])
      .execute();
    await conn.deleteFrom("coach_leaders").where("slug", "=", BENCH).execute();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: BENCH,
        email: BENCH_OLD,
        name: "Addr Bench",
        is_benchmark: true,
      })
      .execute();
    await conn
      .updateTable("coach_leaders")
      .set({ email: OLD })
      .where("slug", "=", SLUG)
      .execute();
  });
  afterEach(async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await conn
      .deleteFrom("coach_leader_email_changes")
      .where("slug", "in", [SLUG, BENCH])
      .execute();
    await conn.deleteFrom("coach_leaders").where("slug", "=", BENCH).execute();
  });

  it("records who changed it, from what, to what", async () => {
    const adminId = await account(REAL);
    expect(
      await live.updateLeaderEmail(SLUG, NEW, { byUserId: adminId }),
    ).toEqual({ ok: true, email: NEW, noticeSent: true });
    expect(await changes(SLUG)).toEqual([
      { previous_email: OLD, new_email: NEW, changed_by: adminId },
    ]);
  });

  it("the old address is told, the new one is not", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    expect(sent.map((s) => s.to)).toEqual([OLD]);
    expect(sent[0].text).toContain("changed");
  });

  it("a placeholder old address gets no notice, and the change is still audited", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ email: PLACEHOLDER })
      .where("slug", "=", SLUG)
      .execute();
    expect(await live.updateLeaderEmail(SLUG, NEW, { byUserId: null })).toEqual(
      { ok: true, email: NEW, noticeSent: false },
    );
    expect(sent).toEqual([]);
    expect(await changes(SLUG)).toHaveLength(1);
  });

  it("during the parallel run no notice is sent", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    expect(await live.updateLeaderEmail(SLUG, NEW, { byUserId: null })).toEqual(
      { ok: true, email: NEW, noticeSent: false },
    );
    expect(sent).toEqual([]);
  });

  it("the benchmark leader's address changes only with confirm, and is audited then", async () => {
    expect(
      await live.updateLeaderEmail(BENCH, NEW, { byUserId: null }),
    ).toEqual({ ok: false, refusal: "confirm-required" });
    expect(await changes(BENCH)).toEqual([]);
    expect(sent).toEqual([]);
    expect(
      await live.updateLeaderEmail(BENCH, NEW, {
        byUserId: null,
        confirm: true,
      }),
    ).toEqual({ ok: true, email: NEW, noticeSent: true });
    expect(await changes(BENCH)).toHaveLength(1);
  });

  it("setting the address it already has writes nothing and sends nothing", async () => {
    expect(await live.updateLeaderEmail(SLUG, OLD, { byUserId: null })).toEqual(
      { ok: true, email: OLD, noticeSent: false },
    );
    expect(await changes(SLUG)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

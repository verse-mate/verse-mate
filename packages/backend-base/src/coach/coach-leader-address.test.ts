import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { sql } from "kysely";

import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import coachPlugin from "./coach.plugin";
import { type CoachDataset, CoachService } from "./coach.service";

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

class Inbox {
  sent: Array<{ to: string; subject: string; text: string }> = [];
  async sendEmail(data: {
    to: { email: string };
    subject: string;
    text: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      text: data.text,
    });
    return { delivered: true };
  }
  tokenFor(email: string): string {
    const mail = this.sent.filter((m) => m.to === email).at(-1);
    const token = mail?.text.match(
      /\/coach\/confirm-address#token=([A-Za-z0-9_-]+)/,
    )?.[1];
    if (!token) throw new Error(`no confirmation link was sent to ${email}`);
    if (mail?.text.includes("?token="))
      throw new Error("the confirmation link carries the token in its query");
    return token;
  }
}

const inbox = new Inbox();
const service = new CoachService(Database, inbox);

async function changeAddress(
  svc: CoachService,
  mail: Inbox,
  slug: string,
  address: string,
  options: { byUserId?: string | null; confirm?: boolean } = {},
) {
  const requested = await svc.updateLeaderEmail(slug, address, options);
  if (!requested.ok || requested.status !== "pending") return requested;
  return svc.confirmLeaderEmailChange(mail.tokenFor(requested.email));
}

async function leaderEmail(slug: string) {
  return (
    await conn
      .selectFrom("coach_leaders")
      .select("email")
      .where("slug", "=", slug)
      .executeTakeFirstOrThrow()
  ).email;
}

async function clear() {
  inbox.sent = [];
  await conn
    .deleteFrom("coach_leader_email_requests")
    .where("slug", "in", [SLUG, WYATT, MILO, "addr-bench"])
    .execute();
  await conn.deleteFrom("coach_reports").where("coach_id", "=", SLUG).execute();
  await conn
    .deleteFrom("coach_leaders")
    .where((eb) =>
      eb.or([
        eb("slug", "in", [SLUG, WYATT, MILO, "addr-other"]),
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
      await changeAddress(
        service,
        inbox,
        SLUG,
        " Addr-Leader.Real@Example.TEST ",
      ),
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

    expect(await changeAddress(service, inbox, WYATT, WYATT_REAL)).toEqual({
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

    await changeAddress(service, inbox, MILO, MILO_NEW);

    expect(await service.getMe(oldAccount)).toBeNull();
  });

  it("an address only the bundled roster holds is refused as taken, and nothing changes", async () => {
    const bundleOnly = "addr-bundle-only@example.test";
    const withBundleOnly = new CoachService(Database, undefined, {
      coaches: [
        {
          id: "addr-bundle-only",
          name: "Addr Bundle Only",
          email: bundleOnly,
          group: "g",
          coachName: "c",
          isCoach: true,
          zoomLink: "",
          reports: [],
        },
      ],
    } as unknown as CoachDataset);
    expect(await withBundleOnly.updateLeaderEmail(SLUG, bundleOnly)).toEqual({
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

  it("an address another admin gives a different leader at the same moment is refused as taken at confirmation, not a server error", async () => {
    const requested = await service.updateLeaderEmail(SLUG, REAL);
    expect(requested).toMatchObject({ ok: true, status: "pending" });
    const token = inbox.tokenFor(REAL);
    let pending = null as Promise<unknown> | null;
    await conn.transaction().execute(async (trx) => {
      await trx
        .updateTable("coach_leaders")
        .set({ email: REAL })
        .where("slug", "=", "addr-other")
        .execute();
      pending = service.confirmLeaderEmailChange(token).catch((e) => e);
      for (let i = 0; i < 100; i += 1) {
        const waiting = await sql<{ n: string }>`
          SELECT count(*) AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query ILIKE 'update "coach_leaders"%'`.execute(conn);
        if (Number(waiting.rows[0].n) > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    expect(await pending).toEqual({ ok: false, refusal: "taken" });
    expect(await leaderEmail(SLUG)).toBe(PLACEHOLDER);
  });

  it("an unknown leader is refused", async () => {
    expect(await service.updateLeaderEmail("addr-nobody", REAL)).toEqual({
      ok: false,
      refusal: "unknown-leader",
    });
  });
});

describe("after an address change, every lookup by address follows the store", () => {
  const ADDED = "addr-added-leader";
  beforeEach(async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: MILO, email: MILO_OLD, name: "Milo Kerr" })
      .execute();
    await changeAddress(service, inbox, MILO, MILO_NEW);
  });
  afterEach(async () => {
    await conn.deleteFrom("coach_leaders").where("slug", "=", ADDED).execute();
    await conn.deleteFrom("user").where("email", "in", [MILO_NEW]).execute();
  });

  it("the previous address is free to add as a new leader", async () => {
    const admin = await account(REAL);
    const added = await service.addLeader(admin, {
      email: MILO_OLD,
      name: "Addr Added Leader",
    });
    expect(added).toMatchObject({ ok: true, coach: { id: ADDED } });
  });

  it("the current address is a duplicate", async () => {
    const admin = await account(REAL);
    expect(
      await service.addLeader(admin, { email: MILO_NEW, name: "Someone" }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });

  it("an invite from the leader's current address is signed with their name", async () => {
    const admin = await account(MILO_NEW);
    const sent: string[] = [];
    const mailer = {
      sendEmail: async (data: { html?: string }) => {
        sent.push(data.html ?? "");
        return { delivered: true };
      },
    };
    await new CoachService(Database, mailer).addLeader(admin, {
      email: "addr-added-leader@example.test",
      name: "Addr Added Leader",
    });
    expect(sent[0]).toContain("Milo Kerr");
  });

  it("a class its owner made is attributed to the leader at the current address", async () => {
    const owner = await account(MILO_NEW);
    await conn
      .insertInto("coach_classes")
      .values({ user_id: owner, name: "Addr class", class_date: "2026-10-01" })
      .execute();
    const mine = (await service.listAllClasses()).filter(
      (c) => c.name === "Addr class",
    );
    expect(mine.map((c) => c.leader.id)).toEqual([MILO]);
  });
});

describe("A Leader's Address Can Be Corrected, once the new address confirms", () => {
  const OLD = "addr-old@example.test";
  const NEW = "addr-new@example.test";
  const BENCH = "addr-bench";
  const BENCH_OLD = "addr-bench@example.test";
  const mail = new Inbox();
  const live = new CoachService(Database, mail);

  async function changes(slug: string) {
    return conn
      .selectFrom("coach_leader_email_changes")
      .select(["previous_email", "new_email", "changed_by"])
      .where("slug", "=", slug)
      .orderBy("changed_at")
      .execute();
  }

  async function addressChange(slug: string) {
    return (await live.listCoaches()).find((c) => c.id === slug)?.addressChange;
  }

  beforeEach(async () => {
    mail.sent = [];
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

  it("An admin changes a leader's address: a link goes to the new address, nothing changes yet, and the admin sees it awaiting confirmation", async () => {
    const adminId = await account(REAL);
    const requested = await live.updateLeaderEmail(SLUG, NEW, {
      byUserId: adminId,
    });
    expect(requested).toMatchObject({
      ok: true,
      email: NEW,
      status: "pending",
      confirmationSent: true,
    });
    expect(mail.sent.map((m) => m.to)).toEqual([NEW]);
    expect(mail.tokenFor(NEW)).toBeTruthy();
    expect(await leaderEmail(SLUG)).toBe(OLD);
    expect(await changes(SLUG)).toEqual([]);
    expect(await addressChange(SLUG)).toMatchObject({
      newEmail: NEW,
      state: "pending",
      reason: null,
    });
    const stored = await conn
      .selectFrom("coach_leader_email_requests")
      .select("token_hash")
      .where("slug", "=", SLUG)
      .executeTakeFirstOrThrow();
    expect(stored.token_hash).not.toBe(mail.tokenFor(NEW));
  });

  it("The link is fetched but not confirmed: describing it changes nothing, shows the requested address masked to a fixed length, and never the current one", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    const token = mail.tokenFor(NEW);
    const described = await live.describeLeaderEmailChange(token);
    expect(described).toEqual({
      leaderName: "Addr Leader",
      newEmail: "a***@example.test",
      state: "pending",
      expiresAt: expect.any(String),
    });
    expect(await live.describeLeaderEmailChange(token)).toEqual(described);
    expect(await leaderEmail(SLUG)).toBe(OLD);
    expect(await addressChange(SLUG)).toMatchObject({ state: "pending" });
    expect(await live.describeLeaderEmailChange("not-a-token")).toBeNull();
  });

  it("a link that no longer works shows only that, with no leader name or address", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    const token = mail.tokenFor(NEW);
    await live.updateLeaderEmail(SLUG, "addr-newer@example.test", {
      byUserId: null,
    });
    expect(await live.describeLeaderEmailChange(token)).toEqual({
      state: "superseded",
      expiresAt: expect.any(String),
    });
    await live.confirmLeaderEmailChange(
      mail.tokenFor("addr-newer@example.test"),
    );
    expect(
      await live.describeLeaderEmailChange(
        mail.tokenFor("addr-newer@example.test"),
      ),
    ).toEqual({ state: "confirmed", expiresAt: expect.any(String) });
  });

  it("The new address confirms: the address changes, the change is recorded with the admin and the previous address, and the previous address is told", async () => {
    const adminId = await account(REAL);
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: adminId });
    expect(await live.confirmLeaderEmailChange(mail.tokenFor(NEW))).toEqual({
      ok: true,
      email: NEW,
      noticeSent: true,
    });
    expect(await leaderEmail(SLUG)).toBe(NEW);
    expect(await changes(SLUG)).toEqual([
      { previous_email: OLD, new_email: NEW, changed_by: adminId },
    ]);
    expect(mail.sent.map((m) => m.to)).toEqual([NEW, OLD]);
    expect(mail.sent[1].text).toContain("changed");
    expect(await addressChange(SLUG)).toBeNull();
  });

  it("the link works once", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    const token = mail.tokenFor(NEW);
    expect(await live.confirmLeaderEmailChange(token)).toMatchObject({
      ok: true,
    });
    expect(await live.confirmLeaderEmailChange(token)).toEqual({
      ok: false,
      refusal: "already-confirmed",
    });
    expect(await changes(SLUG)).toHaveLength(1);
    expect(await live.confirmLeaderEmailChange("not-a-token")).toEqual({
      ok: false,
      refusal: "invalid-link",
    });
  });

  it("An admin changes an address during the parallel run: the link is sent, and on confirmation the address changes and the previous address is told, in words true before go-live", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    expect(
      await live.updateLeaderEmail(SLUG, NEW, { byUserId: null }),
    ).toMatchObject({ ok: true, status: "pending", confirmationSent: true });
    expect(await live.confirmLeaderEmailChange(mail.tokenFor(NEW))).toEqual({
      ok: true,
      email: NEW,
      noticeSent: true,
    });
    expect(await leaderEmail(SLUG)).toBe(NEW);
    expect(mail.sent.map((m) => m.to)).toEqual([NEW, OLD]);
    const notice = mail.sent[1];
    expect(notice.text).toContain(
      "the email address your VerseMate coaching reports and sign-in use",
    );
    expect(notice.text).not.toMatch(/no longer sent|go to\b/);
  });

  it("a placeholder old address gets no notice, and the change is still audited", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ email: PLACEHOLDER })
      .where("slug", "=", SLUG)
      .execute();
    expect(
      await changeAddress(live, mail, SLUG, NEW, { byUserId: null }),
    ).toEqual({ ok: true, email: NEW, noticeSent: false });
    expect(mail.sent.map((m) => m.to)).toEqual([NEW]);
    expect(await changes(SLUG)).toHaveLength(1);
  });

  it("The new address is taken before it confirms: the change is refused, the address is unchanged, and the admin sees why", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    await conn
      .updateTable("coach_leaders")
      .set({ email: NEW })
      .where("slug", "=", "addr-other")
      .execute();
    expect(await live.confirmLeaderEmailChange(mail.tokenFor(NEW))).toEqual({
      ok: false,
      refusal: "taken",
    });
    expect(await leaderEmail(SLUG)).toBe(OLD);
    expect(await changes(SLUG)).toEqual([]);
    expect(await addressChange(SLUG)).toMatchObject({
      newEmail: NEW,
      state: "refused",
      reason: "taken",
    });
  });

  it("A pending change expires: after seven days the admin sees it expired and the link no longer works", async () => {
    const requested = await live.updateLeaderEmail(SLUG, NEW, {
      byUserId: null,
    });
    expect(requested.ok && requested.expiresAt).toBeTruthy();
    const expiresAt = new Date(
      (requested as { expiresAt: string }).expiresAt,
    ).getTime();
    expect(Math.round((expiresAt - Date.now()) / 86_400_000)).toBe(7);
    await conn
      .updateTable("coach_leader_email_requests")
      .set({ expires_at: sql`NOW() - interval '1 minute'` })
      .where("slug", "=", SLUG)
      .execute();
    expect(await addressChange(SLUG)).toMatchObject({ state: "expired" });
    expect(await live.confirmLeaderEmailChange(mail.tokenFor(NEW))).toEqual({
      ok: false,
      refusal: "expired",
    });
    expect(await leaderEmail(SLUG)).toBe(OLD);
  });

  it("a link confirmed one minute before it expires still works", async () => {
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    await conn
      .updateTable("coach_leader_email_requests")
      .set({ expires_at: sql`NOW() + interval '1 minute'` })
      .where("slug", "=", SLUG)
      .execute();
    expect(await live.confirmLeaderEmailChange(mail.tokenFor(NEW))).toEqual({
      ok: true,
      email: NEW,
      noticeSent: true,
    });
    expect(await leaderEmail(SLUG)).toBe(NEW);
  });

  it("A mistyped address never confirms: a newer change for the same leader stops the older link", async () => {
    const MISTYPED = "addr-nwe@example.test";
    await live.updateLeaderEmail(SLUG, MISTYPED, { byUserId: null });
    const stale = mail.tokenFor(MISTYPED);
    await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
    expect(await live.confirmLeaderEmailChange(stale)).toEqual({
      ok: false,
      refusal: "superseded",
    });
    expect(await leaderEmail(SLUG)).toBe(OLD);
    expect(await addressChange(SLUG)).toMatchObject({
      newEmail: NEW,
      state: "pending",
    });
    expect(
      await live.confirmLeaderEmailChange(mail.tokenFor(NEW)),
    ).toMatchObject({ ok: true, email: NEW });
  });

  it("A mistyped address never confirms: setting the address the leader already has withdraws the pending change", async () => {
    const MISTYPED = "addr-nwe@example.test";
    await live.updateLeaderEmail(SLUG, MISTYPED, { byUserId: null });
    const stale = mail.tokenFor(MISTYPED);
    expect(
      await live.updateLeaderEmail(SLUG, OLD, { byUserId: null }),
    ).toMatchObject({ ok: true, status: "unchanged", confirmationSent: false });
    expect(await live.confirmLeaderEmailChange(stale)).toEqual({
      ok: false,
      refusal: "superseded",
    });
    expect(await leaderEmail(SLUG)).toBe(OLD);
    expect(await changes(SLUG)).toEqual([]);
    expect(await addressChange(SLUG)).toBeNull();
  });

  it("a confirmation racing a newer change for the same leader ends in success or superseded, never a server error", async () => {
    for (let round = 0; round < 25; round++) {
      await conn
        .updateTable("coach_leaders")
        .set({ email: OLD })
        .where("slug", "=", SLUG)
        .execute();
      await live.updateLeaderEmail(SLUG, NEW, { byUserId: null });
      const token = mail.tokenFor(NEW);
      const [confirmed, newer] = await Promise.all([
        live.confirmLeaderEmailChange(token),
        live.updateLeaderEmail(SLUG, `addr-race-${round}@example.test`, {
          byUserId: null,
        }),
      ]);
      expect(
        confirmed.ok ||
          (confirmed as { refusal: string }).refusal === "superseded",
      ).toBe(true);
      expect(newer).toMatchObject({ ok: true, status: "pending" });
    }
  });

  it("the benchmark leader's address changes only with confirm, and is audited once the new address confirms", async () => {
    expect(
      await live.updateLeaderEmail(BENCH, NEW, { byUserId: null }),
    ).toEqual({ ok: false, refusal: "confirm-required" });
    expect(mail.sent).toEqual([]);
    expect(
      await changeAddress(live, mail, BENCH, NEW, {
        byUserId: null,
        confirm: true,
      }),
    ).toEqual({ ok: true, email: NEW, noticeSent: true });
    expect(await changes(BENCH)).toHaveLength(1);
  });

  it("setting the address it already has writes nothing and sends nothing", async () => {
    expect(await live.updateLeaderEmail(SLUG, OLD, { byUserId: null })).toEqual(
      {
        ok: true,
        email: OLD,
        status: "unchanged",
        expiresAt: null,
        confirmationSent: false,
      },
    );
    expect(await changes(SLUG)).toEqual([]);
    expect(mail.sent).toEqual([]);
  });
});

describe("the confirmation page's routes need no sign-in, and only the confirm changes anything", () => {
  const NEW = "addr-route-new@example.test";
  const app = new Elysia().use(coachPlugin);
  const store = app.store as unknown as { coachService: unknown };
  const realService = store.coachService;
  const mail = new Inbox();

  beforeEach(async () => {
    mail.sent = [];
    store.coachService = new CoachService(Database, mail);
  });
  afterEach(() => {
    store.coachService = realService;
  });

  const request = (method: string, path: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost/coach/${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

  it("POST describe shows the change and changes nothing; POST confirm applies it once", async () => {
    await (store.coachService as CoachService).updateLeaderEmail(SLUG, NEW);
    const token = mail.tokenFor(NEW);

    const described = await request("POST", "confirm-address/describe", {
      token,
    });
    expect(described.status).toBe(200);
    expect(await described.json()).toMatchObject({
      leaderName: "Addr Leader",
      newEmail: "a***@example.test",
      state: "pending",
    });
    expect(await leaderEmail(SLUG)).toBe(PLACEHOLDER);

    const confirmed = await request("POST", "confirm-address", { token });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ email: NEW, noticeSent: false });
    expect(await leaderEmail(SLUG)).toBe(NEW);

    const again = await request("POST", "confirm-address", { token });
    expect(again.status).toBe(409);
    expect(
      ((await again.json()) as { details: { refusal: string } }).details,
    ).toMatchObject({ refusal: "already-confirmed" });

    const after = await request("POST", "confirm-address/describe", { token });
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({
      state: "confirmed",
      expiresAt: expect.any(String),
    });
  });

  it("the token never travels in a query string", async () => {
    await (store.coachService as CoachService).updateLeaderEmail(SLUG, NEW);
    const token = mail.tokenFor(NEW);
    expect(
      (
        await request(
          "GET",
          `confirm-address?token=${encodeURIComponent(token)}`,
        )
      ).status,
    ).toBe(404);
  });

  it("an unknown link is not found on either route", async () => {
    expect(
      (
        await request("POST", "confirm-address/describe", {
          token: "not-a-token",
        })
      ).status,
    ).toBe(404);
    expect(
      (await request("POST", "confirm-address", { token: "not-a-token" }))
        .status,
    ).toBe(404);
  });
});

describe("notes and invites mail only real addresses, about reports the leader can open", () => {
  let sent: string[] = [];
  const mailer = {
    sendEmail: async (data: { to: { email: string } }) => {
      sent.push(data.to.email);
      return { delivered: true };
    },
  };
  const mailing = new CoachService(Database, mailer);
  const INVITED = "addr-invited@needs-real-email.invalid";

  beforeEach(() => {
    sent = [];
  });
  afterEach(async () => {
    await conn.deleteFrom("coach_notes").where("coach_id", "=", SLUG).execute();
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "=", INVITED)
      .execute();
  });

  async function notes() {
    return conn
      .selectFrom("coach_notes")
      .select(["body", "emailed"])
      .where("coach_id", "=", SLUG)
      .execute();
  }

  it("a note to a leader with a real address is mailed", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ email: REAL })
      .where("slug", "=", SLUG)
      .execute();
    expect(
      await mailing.addNote(SLUG, "addr-report-1", null, "well led"),
    ).toMatchObject({ body: "well led" });
    expect(sent).toEqual([REAL]);
  });

  it("a note to a leader on a placeholder address is kept but not mailed", async () => {
    expect(
      await mailing.addNote(SLUG, "addr-report-1", null, "well led"),
    ).toMatchObject({ body: "well led" });
    expect(sent).toEqual([]);
    expect(await notes()).toEqual([{ body: "well led", emailed: false }]);
  });

  it("a note on a report held from its leader is refused, kept nowhere and mailed to nobody", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ email: REAL })
      .where("slug", "=", SLUG)
      .execute();
    await conn
      .updateTable("coach_reports")
      .set({ held: true })
      .where("id", "=", "addr-report-1")
      .execute();
    expect(
      await mailing.addNote(SLUG, "addr-report-1", null, "about a held one"),
    ).toBe("held");
    expect(sent).toEqual([]);
    expect(await notes()).toEqual([]);
  });

  it("an invite to a placeholder address adds the leader and mails nobody", async () => {
    const admin = await account(REAL);
    expect(
      await mailing.addLeader(admin, { email: INVITED, name: "Addr Invited" }),
    ).toMatchObject({ ok: true });
    expect(sent).toEqual([]);
  });
});

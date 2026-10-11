import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { db as Database } from "database";
import { DISCARD_FLAG } from "database/migrations/20261011010000-coach-reports-and-roster";
import {
  RESTORE_FLAG,
  clearUnprovenRosterConfirmations,
  down,
} from "database/migrations/20261011050000-coach-clear-unproven-confirmations";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();

class RolledBack extends Error {}

type Db = Parameters<typeof down>[0];
type Link = { address: string; providerUserId: string };

afterEach(() => {
  delete process.env[RESTORE_FLAG];
  delete process.env[DISCARD_FLAG];
});

async function rolledBack(work: (trx: Db) => Promise<void>): Promise<void> {
  await conn
    .transaction()
    .execute(async (trx) => {
      await sql`DELETE FROM coach_confirmation_clears`.execute(trx);
      await work(trx);
      throw new RolledBack();
    })
    .catch((error) => {
      if (!(error instanceof RolledBack)) throw error;
    });
}

async function confirmedBeforeDeploy(
  trx: Db,
  email: string,
  opts: { links?: Link[]; password?: string | null; stamped?: boolean } = {},
): Promise<string> {
  const { id } = await trx
    .insertInto("user")
    .values({
      email,
      firstName: "C",
      lastName: "L",
      emailVerified: true,
      password: opts.password === undefined ? "hash" : opts.password,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (!opts.stamped)
    await trx
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", id)
      .execute();
  for (const link of opts.links ?? [])
    await trx
      .insertInto("user_sso_accounts")
      .values({
        user_id: id,
        provider: "google" as never,
        provider_user_id: link.providerUserId,
        email: link.address,
      })
      .execute();
  return id;
}

async function addLeader(trx: Db, slug: string, email: string) {
  await trx
    .insertInto("coach_leaders")
    .values({ slug, email, name: "Clears Leader" })
    .execute();
}

async function account(trx: Db, id: string) {
  return trx
    .selectFrom("user")
    .select(["email", "emailVerified", "email_verified_at"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}

async function links(trx: Db, providerUserId: string) {
  return trx
    .selectFrom("user_sso_accounts")
    .select(["user_id", "email"])
    .where("provider_user_id", "=", providerUserId)
    .execute();
}

async function records(trx: Db, userId: string) {
  const { rows } = await sql<{
    email: string;
    source: string;
    removed_links: { provider_user_id: string; email: string }[];
  }>`SELECT email, source, removed_links FROM coach_confirmation_clears WHERE user_id = ${userId} ORDER BY id`.execute(
    trx,
  );
  return rows;
}

async function restore(trx: Db): Promise<string> {
  process.env[RESTORE_FLAG] = "1";
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await down(trx);
    return String(log.mock.calls.at(-1)?.[0]);
  } finally {
    log.mockRestore();
    delete process.env[RESTORE_FLAG];
  }
}

describe("every cleared confirmation is recorded", () => {
  it("the sweep records the account, its address and the provider links it removed", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-sweep", "clears-sweep@example.test");
      const id = await confirmedBeforeDeploy(
        trx,
        "Clears-Sweep@Example.test ",
        {
          links: [
            {
              address: "clears-other@example.test",
              providerUserId: "clears-1",
            },
          ],
        },
      );

      await clearUnprovenRosterConfirmations(trx);

      expect((await account(trx, id)).emailVerified).toBe(false);
      expect(await links(trx, "clears-1")).toEqual([]);
      const [record, ...rest] = await records(trx, id);
      expect(rest).toEqual([]);
      expect(record?.source).toBe("sweep");
      expect(record?.email).toBe("Clears-Sweep@Example.test ");
      expect(
        record?.removed_links.map((l) => [l.provider_user_id, l.email]),
      ).toEqual([["clears-1", "clears-other@example.test"]]);
    });
  });

  it("the sweep covers the admin list too", async () => {
    await rolledBack(async (trx) => {
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-admin-sweep@example.test" })
        .execute();
      const id = await confirmedBeforeDeploy(
        trx,
        "clears-admin-sweep@example.test",
      );

      await clearUnprovenRosterConfirmations(trx);

      expect((await account(trx, id)).emailVerified).toBe(false);
      expect((await records(trx, id)).map((r) => r.source)).toEqual(["sweep"]);
    });
  });

  it("two accounts cleared in one sweep each record only their own links", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-two-a", "clears-two-a@example.test");
      await addLeader(trx, "clears-two-b", "clears-two-b@example.test");
      const a = await confirmedBeforeDeploy(trx, "clears-two-a@example.test", {
        links: [
          { address: "clears-x@example.test", providerUserId: "clears-a" },
        ],
      });
      const b = await confirmedBeforeDeploy(trx, "clears-two-b@example.test", {
        links: [
          { address: "clears-y@example.test", providerUserId: "clears-b" },
        ],
      });

      await clearUnprovenRosterConfirmations(trx);

      for (const [id, providerUserId] of [
        [a, "clears-a"],
        [b, "clears-b"],
      ] as const)
        expect(
          (await records(trx, id)).map((r) =>
            r.removed_links.map((l) => l.provider_user_id),
          ),
        ).toEqual([[providerUserId]]);
    });
  });

  it("an address joining either list, by insert or by an address change, records the clear its trigger made", async () => {
    await rolledBack(async (trx) => {
      const viaAdmin = await confirmedBeforeDeploy(
        trx,
        "clears-joined-admin@example.test",
      );
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-joined-admin@example.test" })
        .execute();

      const viaLeader = await confirmedBeforeDeploy(
        trx,
        "clears-joined-leader@example.test",
      );
      await addLeader(
        trx,
        "clears-joined",
        "clears-joined-leader@example.test",
      );

      const viaLeaderRename = await confirmedBeforeDeploy(
        trx,
        "clears-renamed-leader@example.test",
      );
      await addLeader(
        trx,
        "clears-placeholder",
        "clears-placeholder@needs-real-email.invalid",
      );
      await trx
        .updateTable("coach_leaders")
        .set({ email: "clears-renamed-leader@example.test" })
        .where("slug", "=", "clears-placeholder")
        .execute();

      const viaAdminRename = await confirmedBeforeDeploy(
        trx,
        "clears-renamed-admin@example.test",
      );
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-admin-placeholder@example.invalid" })
        .execute();
      await trx
        .updateTable("coach_admins")
        .set({ email: "clears-renamed-admin@example.test" })
        .where("email", "=", "clears-admin-placeholder@example.invalid")
        .execute();

      for (const [id, address] of [
        [viaAdmin, "clears-joined-admin@example.test"],
        [viaLeader, "clears-joined-leader@example.test"],
        [viaLeaderRename, "clears-renamed-leader@example.test"],
        [viaAdminRename, "clears-renamed-admin@example.test"],
      ] as const) {
        expect((await account(trx, id)).emailVerified).toBe(false);
        expect(
          (await records(trx, id)).map((r) => [
            r.source,
            r.email,
            r.removed_links,
          ]),
        ).toEqual([["joined", address, []]]);
      }
    });
  });

  it("an account that keeps its confirmation, or is on neither list, gets no record and keeps its links", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-google", "clears-google@example.test");
      await addLeader(trx, "clears-stamped", "clears-stamped@example.test");
      const google = await confirmedBeforeDeploy(
        trx,
        "clears-google@example.test",
        {
          password: null,
          links: [
            {
              address: "clears-google@example.test",
              providerUserId: "clears-g",
            },
          ],
        },
      );
      const stamped = await confirmedBeforeDeploy(
        trx,
        "clears-stamped@example.test",
        { stamped: true },
      );
      const stranger = await confirmedBeforeDeploy(
        trx,
        "clears-stranger@example.test",
        {
          links: [
            {
              address: "clears-elsewhere@example.test",
              providerUserId: "clears-s",
            },
          ],
        },
      );

      await clearUnprovenRosterConfirmations(trx);

      for (const id of [google, stamped, stranger]) {
        expect((await account(trx, id)).emailVerified).toBe(true);
        expect(await records(trx, id)).toEqual([]);
      }
      expect(await links(trx, "clears-g")).toHaveLength(1);
      expect(await links(trx, "clears-s")).toHaveLength(1);
    });
  });
});

describe("rolling the sweep back", () => {
  it("refuses while clears are recorded unless told to restore them or to leave them cleared", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-gate", "clears-gate@example.test");
      const id = await confirmedBeforeDeploy(trx, "clears-gate@example.test");
      await clearUnprovenRosterConfirmations(trx);

      await expect(down(trx)).rejects.toThrow(RESTORE_FLAG);

      process.env[DISCARD_FLAG] = "1";
      await down(trx);
      expect((await account(trx, id)).emailVerified).toBe(false);
      expect(await records(trx, id)).toHaveLength(1);
    });
  });

  it("confirms the account again, unstamped, and restores its links exactly", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-back", "clears-back@example.test");
      const swept = await confirmedBeforeDeploy(
        trx,
        "clears-back@example.test",
        {
          links: [
            { address: "clears-away@example.test", providerUserId: "clears-2" },
          ],
        },
      );
      const before = await trx
        .selectFrom("user_sso_accounts")
        .selectAll()
        .where("provider_user_id", "=", "clears-2")
        .executeTakeFirstOrThrow();
      await clearUnprovenRosterConfirmations(trx);
      const joined = await confirmedBeforeDeploy(
        trx,
        "clears-joined-back@example.test",
      );
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-joined-back@example.test" })
        .execute();

      const log = await restore(trx);

      for (const id of [swept, joined]) {
        const after = await account(trx, id);
        expect(after.emailVerified).toBe(true);
        expect(after.email_verified_at).toBeNull();
        expect(await records(trx, id)).toEqual([]);
      }
      expect(
        await trx
          .selectFrom("user_sso_accounts")
          .selectAll()
          .where("provider_user_id", "=", "clears-2")
          .execute(),
      ).toEqual([before]);
      expect(log).toContain("2 account(s) confirmed again");
      expect(log).toContain("1 of 1 removed provider link(s) restored");
      expect(log).toContain("0 record(s) left");
    });
  });

  it("restores an account whose address differs from the record only by case or spacing", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-case", "clears-case@example.test");
      const id = await confirmedBeforeDeploy(trx, "clears-case@example.test");
      await clearUnprovenRosterConfirmations(trx);
      await trx
        .updateTable("user")
        .set({ email: " CLEARS-Case@Example.test" })
        .where("id", "=", id)
        .execute();

      await restore(trx);

      expect((await account(trx, id)).emailVerified).toBe(true);
    });
  });

  it("leaves an account that changed address, confirmed again or changed password, and keeps its record", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-moved", "clears-moved@example.test");
      await addLeader(trx, "clears-again", "clears-again@example.test");
      await addLeader(trx, "clears-reset", "clears-reset@example.test");
      const moved = await confirmedBeforeDeploy(
        trx,
        "clears-moved@example.test",
      );
      const again = await confirmedBeforeDeploy(
        trx,
        "clears-again@example.test",
      );
      const reset = await confirmedBeforeDeploy(
        trx,
        "clears-reset@example.test",
        {
          links: [
            {
              address: "clears-renamer@example.test",
              providerUserId: "clears-4",
            },
          ],
        },
      );
      await clearUnprovenRosterConfirmations(trx);
      await trx
        .updateTable("user")
        .set({ email: "clears-moved-on@example.test" })
        .where("id", "=", moved)
        .execute();
      const stamp = new Date("2026-10-11T10:00:00Z");
      await trx
        .updateTable("user")
        .set({ emailVerified: true, email_verified_at: stamp })
        .where("id", "=", again)
        .execute();
      await trx
        .updateTable("user")
        .set({ password: "the owner's new hash" })
        .where("id", "=", reset)
        .execute();

      const log = await restore(trx);

      expect((await account(trx, moved)).emailVerified).toBe(false);
      const reconfirmed = await account(trx, again);
      expect(reconfirmed.emailVerified).toBe(true);
      expect(reconfirmed.email_verified_at).toEqual(stamp);
      expect((await account(trx, reset)).emailVerified).toBe(false);
      expect(await links(trx, "clears-4")).toEqual([]);
      for (const id of [moved, again, reset])
        expect(await records(trx, id)).toHaveLength(1);
      expect(log).toContain("0 account(s) confirmed again");
      expect(log).toContain("3 record(s) left");
    });
  });

  it("a removed link whose provider account is linked again is skipped, not duplicated", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-taken", "clears-taken@example.test");
      const cleared = await confirmedBeforeDeploy(
        trx,
        "clears-taken@example.test",
        {
          links: [
            {
              address: "clears-owner@example.test",
              providerUserId: "clears-3",
            },
          ],
        },
      );
      await clearUnprovenRosterConfirmations(trx);
      const owner = await confirmedBeforeDeploy(
        trx,
        "clears-owner@example.test",
        {
          links: [
            {
              address: "clears-owner@example.test",
              providerUserId: "clears-3",
            },
          ],
        },
      );

      const log = await restore(trx);

      expect((await account(trx, cleared)).emailVerified).toBe(true);
      expect(await links(trx, "clears-3")).toEqual([
        { user_id: owner, email: "clears-owner@example.test" },
      ]);
      expect(log).toContain(
        "0 of 1 removed provider link(s) restored (1 skipped",
      );
    });
  });

  it("two records of one account holding the same link restore it once", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-twice", "clears-twice@example.test");
      const id = await confirmedBeforeDeploy(trx, "clears-twice@example.test", {
        links: [
          { address: "clears-far@example.test", providerUserId: "clears-5" },
        ],
      });
      await clearUnprovenRosterConfirmations(trx);
      await trx
        .updateTable("user")
        .set({ emailVerified: true })
        .where("id", "=", id)
        .execute();
      await trx
        .insertInto("user_sso_accounts")
        .values({
          user_id: id,
          provider: "google" as never,
          provider_user_id: "clears-5",
          email: "clears-far@example.test",
        })
        .execute();
      await clearUnprovenRosterConfirmations(trx);
      expect(await records(trx, id)).toHaveLength(2);

      const log = await restore(trx);

      expect((await account(trx, id)).emailVerified).toBe(true);
      expect(await links(trx, "clears-5")).toHaveLength(1);
      expect(await records(trx, id)).toEqual([]);
      expect(log).toContain("1 account(s) confirmed again");
      expect(log).toContain("1 of 2 removed provider link(s) restored");
    });
  });

  it("a deleted account takes its records with it", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-gone", "clears-gone@example.test");
      const id = await confirmedBeforeDeploy(trx, "clears-gone@example.test");
      await clearUnprovenRosterConfirmations(trx);
      await trx.deleteFrom("user").where("id", "=", id).execute();

      expect(await records(trx, id)).toEqual([]);
      expect(await restore(trx)).toContain("0 record(s) left");
    });
  });
});

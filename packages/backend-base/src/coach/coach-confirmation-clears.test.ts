import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import {
  clearUnprovenRosterConfirmations,
  down,
} from "database/migrations/20261011050000-coach-clear-unproven-confirmations";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();

class RolledBack extends Error {}

type Db = Parameters<typeof down>[0];

async function rolledBack(work: (trx: Db) => Promise<void>): Promise<void> {
  await conn
    .transaction()
    .execute(async (trx) => {
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
  links: { address: string; providerUserId: string }[] = [],
): Promise<string> {
  const { id } = await trx
    .insertInto("user")
    .values({
      email,
      firstName: "C",
      lastName: "L",
      emailVerified: true,
      password: "hash",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await trx
    .updateTable("user")
    .set({ email_verified_at: null })
    .where("id", "=", id)
    .execute();
  for (const link of links)
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

describe("the confirmation sweep records what it clears, and its down puts it back", () => {
  it("the sweep records the account, its address and the provider links it removed", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-sweep", "clears-sweep@example.test");
      const id = await confirmedBeforeDeploy(
        trx,
        "Clears-Sweep@Example.test ",
        [{ address: "clears-other@example.test", providerUserId: "clears-1" }],
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

  it("an address joining the roster records the clear its trigger made", async () => {
    await rolledBack(async (trx) => {
      const id = await confirmedBeforeDeploy(trx, "clears-joined@example.test");
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-joined@example.test" })
        .execute();

      expect((await account(trx, id)).emailVerified).toBe(false);
      expect(
        (await records(trx, id)).map((r) => [r.source, r.removed_links]),
      ).toEqual([["joined", []]]);
    });
  });

  it("the down confirms the account again, unstamped, and restores its links", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-back", "clears-back@example.test");
      const swept = await confirmedBeforeDeploy(
        trx,
        "clears-back@example.test",
        [
          {
            address: "clears-elsewhere@example.test",
            providerUserId: "clears-2",
          },
        ],
      );
      await clearUnprovenRosterConfirmations(trx);
      const joined = await confirmedBeforeDeploy(
        trx,
        "clears-joined-back@example.test",
      );
      await trx
        .insertInto("coach_admins")
        .values({ email: "clears-joined-back@example.test" })
        .execute();

      await down(trx);

      for (const id of [swept, joined]) {
        const after = await account(trx, id);
        expect(after.emailVerified).toBe(true);
        expect(after.email_verified_at).toBeNull();
        expect(await records(trx, id)).toEqual([]);
      }
      expect(await links(trx, "clears-2")).toEqual([
        { user_id: swept, email: "clears-elsewhere@example.test" },
      ]);
    });
  });

  it("the down leaves an account that changed address or confirmed again, and keeps its record", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-moved", "clears-moved@example.test");
      await addLeader(trx, "clears-again", "clears-again@example.test");
      const moved = await confirmedBeforeDeploy(
        trx,
        "clears-moved@example.test",
      );
      const again = await confirmedBeforeDeploy(
        trx,
        "clears-again@example.test",
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

      await down(trx);

      expect((await account(trx, moved)).emailVerified).toBe(false);
      expect(await records(trx, moved)).toHaveLength(1);
      const reconfirmed = await account(trx, again);
      expect(reconfirmed.emailVerified).toBe(true);
      expect(reconfirmed.email_verified_at).toEqual(stamp);
      expect(await records(trx, again)).toHaveLength(1);
    });
  });

  it("a removed link whose provider account is linked again elsewhere is skipped, not duplicated", async () => {
    await rolledBack(async (trx) => {
      await addLeader(trx, "clears-taken", "clears-taken@example.test");
      const cleared = await confirmedBeforeDeploy(
        trx,
        "clears-taken@example.test",
        [{ address: "clears-owner@example.test", providerUserId: "clears-3" }],
      );
      await clearUnprovenRosterConfirmations(trx);
      const owner = await confirmedBeforeDeploy(
        trx,
        "clears-owner@example.test",
        [{ address: "clears-owner@example.test", providerUserId: "clears-3" }],
      );

      await down(trx);

      expect((await account(trx, cleared)).emailVerified).toBe(true);
      expect(await links(trx, "clears-3")).toEqual([
        { user_id: owner, email: "clears-owner@example.test" },
      ]);
    });
  });
});

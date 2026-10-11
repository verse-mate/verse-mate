import { afterEach, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { sql } from "database";
import { up } from "database/migrations/20261011130000-unstamp-confirmations-kept-with-foreign-links";
import type Database from "database/src/models/Database";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import type { Transaction } from "kysely";

import shared from "../shared/shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let created: string[] = [];

class RolledBack extends Error {}

afterEach(async () => {
  if (created.length > 0)
    await conn.deleteFrom("user").where("id", "in", created).execute();
  created = [];
});

async function stampExisted() {
  const { rows } = await sql<{ at: string }>`
    SELECT "timestamp" AS at FROM kysely_migration
    WHERE name = '20261011000000-user-confirmation-stamp'
  `.execute(conn);
  return new Date(rows[0].at).getTime();
}

type Link = { address?: (email: string) => string; createdAt: number };

async function account(options: {
  links: Link[];
  stampedAt?: number;
  unstamped?: boolean;
  userEmail?: (email: string) => string;
}) {
  const email = `unstamp-${faker.string.uuid()}@example.test`;
  const { id } = await conn
    .insertInto("user")
    .values({
      email: options.userEmail ? options.userEmail(email) : email,
      firstName: "U",
      lastName: "S",
      emailVerified: true,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  created.push(id);
  if (options.stampedAt !== undefined || options.unstamped)
    await conn
      .updateTable("user")
      .set({
        email_verified_at: options.unstamped
          ? null
          : new Date(options.stampedAt ?? 0),
      })
      .where("id", "=", id)
      .execute();
  for (const [n, link] of options.links.entries())
    await conn
      .insertInto("user_sso_accounts")
      .values({
        user_id: id,
        provider: n === 0 ? SsoProviderEnum.google : SsoProviderEnum.apple,
        provider_user_id: `unstamp-${n}-${id}`,
        email: link.address ? link.address(email) : email,
        created_at: sql`${new Date(link.createdAt).toISOString()}::timestamptz AT TIME ZONE 'UTC'`,
      })
      .execute();
  return id;
}

type AfterUp = {
  emailVerified: boolean;
  stamped: boolean;
  links: number;
};

async function afterUp(
  ids: string[],
  before?: (trx: Transaction<Database>) => Promise<void>,
) {
  const seen = new Map<string, AfterUp>();
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
      if (before) await before(trx);
      await up(trx);
      for (const id of ids) {
        const user = await trx
          .selectFrom("user")
          .select(["emailVerified", "email_verified_at"])
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        const links = await trx
          .selectFrom("user_sso_accounts")
          .select("id")
          .where("user_id", "=", id)
          .execute();
        seen.set(id, {
          emailVerified: user.emailVerified,
          stamped: user.email_verified_at !== null,
          links: links.length,
        });
      }
      throw new RolledBack();
    })
    .catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(RolledBack);
  return seen;
}

const foreign = () => () => `elsewhere-${faker.string.uuid()}@example.test`;

describe("clearing confirmations that rest on a link nobody proved", () => {
  it("clears stamps on accounts keeping a link for another address or a link made before linking required a verified address, and deletes no link", async () => {
    const existed = await stampExisted();
    const later = existed + 2 * DAY;

    const keptForeign = await account({
      links: [{ address: foreign(), createdAt: later }],
    });
    const stampedEarly = await account({
      links: [{ address: foreign(), createdAt: later }],
      stampedAt: existed - 60_000,
    });
    const oldOwnLink = await account({
      links: [{ createdAt: existed - 30 * DAY }],
    });
    const ownLinkInMargin = await account({
      links: [{ createdAt: existed + HOUR }],
    });
    const ownAndForeign = await account({
      links: [{ createdAt: later }, { address: foreign(), createdAt: later }],
    });
    const after = await afterUp([
      keptForeign,
      stampedEarly,
      oldOwnLink,
      ownLinkInMargin,
      ownAndForeign,
    ]);

    expect(after.get(keptForeign)).toEqual({
      emailVerified: true,
      stamped: false,
      links: 1,
    });
    expect(after.get(stampedEarly)?.stamped).toBe(false);
    expect(after.get(oldOwnLink)).toEqual({
      emailVerified: true,
      stamped: false,
      links: 1,
    });
    expect(after.get(ownLinkInMargin)?.stamped).toBe(false);
    expect(after.get(ownAndForeign)).toEqual({
      emailVerified: true,
      stamped: false,
      links: 2,
    });
  });

  it("keeps stamps resting only on links made a day after the stamp existed, whatever the case or spacing of either address", async () => {
    const existed = await stampExisted();
    const later = existed + 2 * DAY;

    const ownLink = await account({ links: [{ createdAt: later }] });
    const pastMargin = await account({
      links: [{ createdAt: existed + DAY + HOUR }],
    });
    const linkShouting = await account({
      links: [
        {
          createdAt: later,
          address: (email) => `  ${email.toUpperCase()} `,
        },
      ],
    });
    const ownLinkShouting = await account({
      links: [{ createdAt: later }],
      userEmail: (email) => `  ${email.toUpperCase()} `,
    });
    const noLink = await account({ links: [] });
    const after = await afterUp([
      ownLink,
      pastMargin,
      linkShouting,
      ownLinkShouting,
      noLink,
    ]);

    expect(after.get(ownLink)?.stamped).toBe(true);
    expect(after.get(pastMargin)?.stamped).toBe(true);
    expect(after.get(linkShouting)?.stamped).toBe(true);
    expect(after.get(ownLinkShouting)?.stamped).toBe(true);
    expect(after.get(noLink)?.stamped).toBe(true);
  });

  it("does not write to rows that carry no stamp", async () => {
    const unstamped = await account({
      links: [{ address: foreign(), createdAt: Date.now() }],
      unstamped: true,
    });
    const version = () =>
      sql<{
        version: string;
      }>`SELECT xmin::text AS version FROM "user" WHERE id = ${unstamped}`;
    const before = (await version().execute(conn)).rows[0].version;
    let after = "";

    const outcome = await conn
      .transaction()
      .execute(async (trx) => {
        await up(trx);
        after = (await version().execute(trx)).rows[0].version;
        throw new RolledBack();
      })
      .catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(RolledBack);
    expect(after).toBe(before);
  });

  it("treats every link as made before when the stamp migration's record is missing", async () => {
    const ownLink = await account({
      links: [{ createdAt: (await stampExisted()) + 2 * DAY }],
    });

    const after = await afterUp([ownLink], async (trx) => {
      await sql`
        DELETE FROM kysely_migration
        WHERE name = '20261011000000-user-confirmation-stamp'
      `.execute(trx);
    });

    expect(after.get(ownLink)?.stamped).toBe(false);
  });
});

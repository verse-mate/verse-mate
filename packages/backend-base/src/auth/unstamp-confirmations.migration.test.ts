import { afterEach, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { sql } from "database";
import { up } from "database/migrations/20261011130000-unstamp-confirmations-kept-with-foreign-links";
import SsoProviderEnum from "database/src/models/public/SsoProviderEnum";

import shared from "../shared/shared.plugin";

const conn = shared.store.db.getOrCreateConnection();
const DAY = 86_400_000;
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

async function afterUp(ids: string[]) {
  const seen = new Map<string, AfterUp>();
  const outcome = await conn
    .transaction()
    .execute(async (trx) => {
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

describe("clearing confirmations that rest on a sign-in link", () => {
  it("clears the stamp on every stamped account that keeps any sign-in link, whatever its address or age, and deletes no link", async () => {
    const existed = await stampExisted();

    const keptForeign = await account({
      links: [{ address: foreign(), createdAt: existed + 2 * DAY }],
    });
    const stampedEarly = await account({
      links: [{ address: foreign(), createdAt: existed + 2 * DAY }],
      stampedAt: existed - 60_000,
    });
    const oldOwnLink = await account({
      links: [{ createdAt: existed - 30 * DAY }],
    });
    const recentOwnLink = await account({
      links: [{ createdAt: existed + 2 * DAY }],
    });
    const ownLinkShouting = await account({
      links: [{ createdAt: existed + 2 * DAY }],
      userEmail: (email) => `  ${email.toUpperCase()} `,
    });
    const ownAndForeign = await account({
      links: [
        { createdAt: existed + 2 * DAY },
        { address: foreign(), createdAt: existed + 2 * DAY },
      ],
    });
    const after = await afterUp([
      keptForeign,
      stampedEarly,
      oldOwnLink,
      recentOwnLink,
      ownLinkShouting,
      ownAndForeign,
    ]);

    for (const [id, links] of [
      [keptForeign, 1],
      [stampedEarly, 1],
      [oldOwnLink, 1],
      [recentOwnLink, 1],
      [ownLinkShouting, 1],
      [ownAndForeign, 2],
    ] as const)
      expect(after.get(id)).toEqual({
        emailVerified: true,
        stamped: false,
        links,
      });
  });

  it("keeps the stamp on accounts with no sign-in link", async () => {
    const noLink = await account({ links: [] });

    const after = await afterUp([noLink]);

    expect(after.get(noLink)).toEqual({
      emailVerified: true,
      stamped: true,
      links: 0,
    });
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
});
